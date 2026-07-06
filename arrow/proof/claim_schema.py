"""Dataclass schemas for Arrow Proof Phase 2 claim extraction.

Same conventions as schemas.py: plain dataclasses, aware UTC datetimes,
to_dict/from_dict for JSONL round-tripping.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from schemas import iso, parse_dt, utc_now

# The closed set of political claim types the world-state builder understands.
CLAIM_TYPES = frozenset({
    "public_dissent",
    "leadership_support",
    "leadership_opposition",
    "faction_alignment",
    "ideological_conflict",
    "electoral_pressure",
    "media_pressure",
    "institutional_constraint",
    "relationship_support",
    "relationship_break",
    "network_signal",
    "scandal_pressure",
    "polling_decline",
    "elite_signal",
})

POLARITIES = frozenset({"positive", "negative", "neutral"})


@dataclass
class ExtractedClaim:
    """One structured political claim extracted from one evidence item."""

    claim_id: str
    case_id: str
    evidence_id: str
    actor: str                      # who acts/speaks; "unattributed" if unknown
    target_actor_or_org: str        # who/what the claim bears on
    claim_type: str                 # one of CLAIM_TYPES
    polarity: str                   # positive/negative/neutral for the target
    strength: float                 # 0..1, how strong the signal is
    confidence: float               # 0..1, how sure the extractor is
    event_time: Optional[datetime]
    knowledge_time: Optional[datetime]
    text_span: str                  # the exact text the claim was drawn from
    source_title: str
    extractor_name: str
    extractor_version: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim_id": self.claim_id,
            "case_id": self.case_id,
            "evidence_id": self.evidence_id,
            "actor": self.actor,
            "target_actor_or_org": self.target_actor_or_org,
            "claim_type": self.claim_type,
            "polarity": self.polarity,
            "strength": self.strength,
            "confidence": self.confidence,
            "event_time": iso(self.event_time),
            "knowledge_time": iso(self.knowledge_time),
            "text_span": self.text_span,
            "source_title": self.source_title,
            "extractor_name": self.extractor_name,
            "extractor_version": self.extractor_version,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ExtractedClaim":
        return cls(
            claim_id=d["claim_id"],
            case_id=d["case_id"],
            evidence_id=d.get("evidence_id", ""),
            actor=d.get("actor", "unattributed"),
            target_actor_or_org=d.get("target_actor_or_org", ""),
            claim_type=d.get("claim_type", ""),
            polarity=d.get("polarity", "neutral"),
            strength=float(d.get("strength") or 0.0),
            confidence=float(d.get("confidence") or 0.0),
            event_time=parse_dt(d.get("event_time")),
            knowledge_time=parse_dt(d.get("knowledge_time")),
            text_span=d.get("text_span", ""),
            source_title=d.get("source_title", ""),
            extractor_name=d.get("extractor_name", ""),
            extractor_version=d.get("extractor_version", ""),
            notes=d.get("notes", ""),
        )


@dataclass
class ClaimValidationIssue:
    """A structured problem found while validating an extracted claim."""

    severity: str          # "error" | "warning"
    code: str
    message: str
    claim_id: Optional[str] = None
    field_name: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "claim_id": self.claim_id,
            "field_name": self.field_name,
        }


@dataclass
class ClaimExtractionReport:
    """Summary of one claim-extraction run over a case directory."""

    case_id: str
    generated_at: datetime
    extractor_name: str
    extractor_version: str
    evidence_items_read: int
    claims_generated: int
    claims_by_type: dict[str, int]
    validation_issues: list[ClaimValidationIssue] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "generated_at": iso(self.generated_at),
            "extractor_name": self.extractor_name,
            "extractor_version": self.extractor_version,
            "evidence_items_read": self.evidence_items_read,
            "claims_generated": self.claims_generated,
            "claims_by_type": self.claims_by_type,
            "validation_issues": [i.to_dict() for i in self.validation_issues],
            "notes": self.notes,
        }
