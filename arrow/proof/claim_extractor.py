"""Phase 2 claim extraction: evidence.jsonl -> extracted_claims.jsonl.

A deliberately simple, transparent rule-based extractor. No LLM, no network.
The extractor interface (``ClaimExtractor``) is the seam where an LLM-backed
extractor can be swapped in later without touching the pipeline.

Usage:  python claim_extractor.py <case_dir>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Protocol

from case_store import load_case_config
from claim_schema import ClaimExtractionReport, ExtractedClaim
from claim_store import write_claims
from claim_validation import validate_claims
from evidence_store import read_evidence
from schemas import CaseConfig, EvidenceItem, utc_now

REPORT_FILE = "claim_extraction_report.json"


class ClaimExtractor(Protocol):
    """Interface every extractor (rule-based now, LLM later) must satisfy.

    ``extract`` returns claims WITHOUT claim_ids; the pipeline assigns ids so
    they stay unique and stable across extractors.
    """

    name: str
    version: str

    def extract(self, item: EvidenceItem, config: CaseConfig) -> list[ExtractedClaim]:
        ...


# --------------------------------------------------------------------------
# Rule-based extractor
# --------------------------------------------------------------------------

# Each rule: keyword phrases -> claim type. Rules with ``type_if_target`` pick
# the leadership-flavoured type when the case's target actor is named in the
# same sentence, otherwise the generic type.
_RULES: list[dict] = [
    {"keywords": ["criticised", "criticized", "attacked", "rebuked", "condemned"],
     "type_if_target": "leadership_opposition", "type_else": "public_dissent",
     "base_strength": 0.6},
    {"keywords": ["backed", "endorsed", "supported"],
     "type_if_target": "leadership_support", "type_else": "relationship_support",
     "base_strength": 0.6},
    {"keywords": ["rebellion", "revolt", "plot"],
     "type": "faction_alignment", "base_strength": 0.7},
    {"keywords": ["challenge"],
     "type": "elite_signal", "base_strength": 0.5},
    {"keywords": ["poll slump", "polls fell", "polls slumped", "approval fell"],
     "type": "polling_decline", "base_strength": 0.7},
    {"keywords": ["scandal", "controversy", "allegation"],
     "type": "scandal_pressure", "base_strength": 0.6},
    {"keywords": ["media pressure", "newspapers", "front page", "coverage intensified"],
     "type": "media_pressure", "base_strength": 0.5},
    {"keywords": ["rules", "committee", "procedure", "whip", "confidence vote"],
     "type": "institutional_constraint", "base_strength": 0.4},
    {"keywords": ["ideological", "principle", "red line", "betrayed"],
     "type": "ideological_conflict", "base_strength": 0.5},
]

# How each claim type bears on the target's position.
_POLARITY = {
    "public_dissent": "negative",
    "leadership_support": "positive",
    "leadership_opposition": "negative",
    "faction_alignment": "negative",
    "ideological_conflict": "negative",
    "electoral_pressure": "negative",
    "media_pressure": "negative",
    "institutional_constraint": "neutral",
    "relationship_support": "positive",
    "relationship_break": "negative",
    "network_signal": "neutral",
    "scandal_pressure": "negative",
    "polling_decline": "negative",
    "elite_signal": "negative",
}

# Confidence starting point by source reliability tier.
_TIER_CONFIDENCE = {
    "primary": 0.8,
    "official": 0.8,
    "mainstream": 0.7,
    "unrated": 0.5,
    "partisan": 0.4,
}


def _target_surname(config: CaseConfig) -> str:
    """Best-effort surname of the target actor, e.g. 'Alexandra Voss, ...' -> 'voss'."""
    name_part = config.target_actor.split(",")[0].strip()
    tokens = [t for t in re.split(r"\s+", name_part) if t.isalpha()]
    return tokens[-1].lower() if tokens else ""


def _sentences(text: str) -> list[str]:
    """Split raw source text into rough sentences."""
    flat = re.sub(r"\s+", " ", text).strip()
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", flat) if s.strip()]


def _count_hits(sentence_lower: str, keywords: list[str]) -> int:
    hits = 0
    for kw in keywords:
        hits += len(re.findall(rf"\b{re.escape(kw)}\b", sentence_lower))
    return hits


class RuleBasedExtractor:
    """Keyword-rule extractor. Transparent by design: every claim quotes the
    sentence it came from, and strength/confidence are simple documented sums."""

    name = "rule_based_keyword_extractor"
    version = "0.1.0"

    def extract(self, item: EvidenceItem, config: CaseConfig) -> list[ExtractedClaim]:
        surname = _target_surname(config)
        claims: list[ExtractedClaim] = []

        for sentence in _sentences(item.text):
            lower = sentence.lower()
            mentions_target = bool(surname) and surname in lower

            for rule in _RULES:
                hits = _count_hits(lower, rule["keywords"])
                if hits == 0:
                    continue
                if "type" in rule:
                    claim_type = rule["type"]
                else:
                    claim_type = rule["type_if_target"] if mentions_target else rule["type_else"]

                # Strength: category base + 0.1 per extra keyword hit, capped.
                strength = round(min(0.9, rule["base_strength"] + 0.1 * (hits - 1)), 2)

                # Confidence: tier base, nudged down for very long spans where
                # the keyword context is weaker. Never above 0.9 — this is a
                # keyword matcher, not an understanding of the text.
                confidence = _TIER_CONFIDENCE.get(item.reliability_tier, 0.5)
                if len(sentence) > 300:
                    confidence -= 0.1
                confidence = round(max(0.1, min(0.9, confidence)), 2)

                matched = [
                    kw for kw in rule["keywords"]
                    if re.search(rf"\b{re.escape(kw)}\b", lower)
                ]
                claims.append(ExtractedClaim(
                    claim_id="",  # assigned by the pipeline
                    case_id=item.case_id,
                    evidence_id=item.evidence_id,
                    actor="unattributed",  # rule matcher does no entity resolution
                    target_actor_or_org=(
                        config.target_actor if mentions_target else config.target_organisation
                    ),
                    claim_type=claim_type,
                    polarity=_POLARITY[claim_type],
                    strength=strength,
                    confidence=confidence,
                    event_time=item.event_time,
                    knowledge_time=item.knowledge_time,
                    text_span=sentence,
                    source_title=item.title,
                    extractor_name=self.name,
                    extractor_version=self.version,
                    notes=f"matched keywords: {', '.join(matched)}",
                ))
        return claims


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------

def extract_case(case_dir: Path, extractor: ClaimExtractor | None = None) -> ClaimExtractionReport:
    """Run claim extraction for one case directory and write outputs."""
    case_dir = Path(case_dir)
    config = load_case_config(case_dir)
    extractor = extractor or RuleBasedExtractor()

    evidence = read_evidence(case_dir)  # included, leakage-screened evidence only
    claims: list[ExtractedClaim] = []
    for item in evidence:
        claims.extend(extractor.extract(item, config))
    for index, claim in enumerate(claims, start=1):
        claim.claim_id = f"cl-{index:04d}"

    issues = validate_claims(
        claims, config.forecast_cutoff,
        known_evidence_ids={e.evidence_id for e in evidence},
    )

    claims_by_type: dict[str, int] = {}
    for claim in claims:
        claims_by_type[claim.claim_type] = claims_by_type.get(claim.claim_type, 0) + 1

    write_claims(case_dir, claims)
    report = ClaimExtractionReport(
        case_id=config.case_id,
        generated_at=utc_now(),
        extractor_name=extractor.name,
        extractor_version=extractor.version,
        evidence_items_read=len(evidence),
        claims_generated=len(claims),
        claims_by_type=claims_by_type,
        validation_issues=issues,
        notes="Rule-based keyword extraction; strength/confidence are heuristic, not calibrated.",
    )
    (case_dir / REPORT_FILE).write_text(
        json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return report


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python claim_extractor.py <case_dir>")
        sys.exit(2)
    result = extract_case(Path(sys.argv[1]))
    print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
