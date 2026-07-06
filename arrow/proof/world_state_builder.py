"""Phase 3 world-state building: extracted_claims.jsonl -> world_state.json.

Aggregates claims into actor-level signals, claim-type signals, and six
world-system inputs. Every number is transparent arithmetic over the claim
set — heuristic aggregates, NOT calibrated probabilities.

Usage:  python world_state_builder.py <case_dir>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from case_store import load_case_config
from claim_schema import ExtractedClaim
from claim_store import read_claims
from evidence_store import read_evidence
from schemas import utc_now
from world_state_schema import (
    ActorState,
    ClaimTypeSignal,
    WorldState,
    WorldStateBuildReport,
    WorldSystemInputs,
)
from world_state_store import write_world_state
from world_state_validation import validate_world_state

REPORT_FILE = "world_state_report.json"
TOP_CLAIMS_LIMIT = 5

# How each world-system input is fed. Each input takes the MAX weighted_score
# among its contributing claim-type signals (a strong single signal should not
# be diluted by absent siblings; sums could exceed 1 and fake precision).
_WORLD_SYSTEM_SOURCES: dict[str, list[str]] = {
    "incentive": ["electoral_pressure", "polling_decline"],
    "faction": ["faction_alignment", "elite_signal", "leadership_opposition"],
    "ideology": ["ideological_conflict"],
    "network_contagion": ["network_signal", "relationship_break", "relationship_support"],
    "institutional": ["institutional_constraint"],
    "media_pressure": ["media_pressure", "scandal_pressure", "public_dissent"],
}

# Polarity weighting for actor pressure: negative claims add pressure,
# positive claims relieve it, neutral claims count half.
_POLARITY_WEIGHT = {"negative": 1.0, "neutral": 0.5, "positive": -1.0}


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 3) if values else 0.0


def _build_actor_states(claims: list[ExtractedClaim]) -> list[ActorState]:
    by_actor: dict[str, list[ExtractedClaim]] = {}
    for claim in claims:
        by_actor.setdefault(claim.actor, []).append(claim)

    actors: list[ActorState] = []
    for actor, group in sorted(by_actor.items()):
        type_counts: dict[str, int] = {}
        for claim in group:
            type_counts[claim.claim_type] = type_counts.get(claim.claim_type, 0) + 1
        max_count = max(type_counts.values())
        dominant = sorted(t for t, n in type_counts.items() if n == max_count)

        # Pressure: polarity-weighted mean of strength*confidence, floored at 0.
        contributions = [
            claim.strength * claim.confidence * _POLARITY_WEIGHT.get(claim.polarity, 0.5)
            for claim in group
        ]
        pressure = round(min(1.0, max(0.0, sum(contributions) / len(group))), 3)

        actors.append(ActorState(
            actor=actor,
            claim_count=len(group),
            average_strength=_mean([c.strength for c in group]),
            average_confidence=_mean([c.confidence for c in group]),
            dominant_claim_types=dominant,
            supporting_claim_ids=[c.claim_id for c in group],
            pressure_score=pressure,
            notes="pressure = polarity-weighted mean of strength*confidence, clamped to [0,1]",
        ))
    return actors


def _build_claim_type_signals(claims: list[ExtractedClaim]) -> list[ClaimTypeSignal]:
    by_type: dict[str, list[ExtractedClaim]] = {}
    for claim in claims:
        by_type.setdefault(claim.claim_type, []).append(claim)

    signals: list[ClaimTypeSignal] = []
    for claim_type, group in sorted(by_type.items()):
        avg_strength = _mean([c.strength for c in group])
        avg_confidence = _mean([c.confidence for c in group])
        signals.append(ClaimTypeSignal(
            claim_type=claim_type,
            claim_count=len(group),
            average_strength=avg_strength,
            average_confidence=avg_confidence,
            weighted_score=round(avg_strength * avg_confidence, 3),
            supporting_claim_ids=[c.claim_id for c in group],
        ))
    return signals


def _build_world_system_inputs(signals: list[ClaimTypeSignal]) -> WorldSystemInputs:
    score_by_type = {s.claim_type: s.weighted_score for s in signals}
    values = {
        name: round(min(1.0, max(0.0, max(
            (score_by_type.get(t, 0.0) for t in sources), default=0.0
        ))), 3)
        for name, sources in _WORLD_SYSTEM_SOURCES.items()
    }
    return WorldSystemInputs(**values)


def build_world_state(case_dir: Path) -> tuple[WorldState, WorldStateBuildReport]:
    """Build and persist the world state for one case directory."""
    case_dir = Path(case_dir)
    config = load_case_config(case_dir)
    evidence = read_evidence(case_dir)
    claims = read_claims(case_dir)

    actors = _build_actor_states(claims)
    signals = _build_claim_type_signals(claims)
    inputs = _build_world_system_inputs(signals)

    top = sorted(claims, key=lambda c: c.strength * c.confidence, reverse=True)
    top_claims = [
        {
            "claim_id": c.claim_id,
            "claim_type": c.claim_type,
            "weighted_score": round(c.strength * c.confidence, 3),
            "text_span": c.text_span,
        }
        for c in top[:TOP_CLAIMS_LIMIT]
    ]

    limitations = [
        "All scores are heuristic aggregates of rule-based keyword extraction; "
        "they are not calibrated probabilities.",
        "Actor resolution is naive: the rule extractor attributes all claims to "
        "'unattributed', so actor-level aggregation is coarse.",
    ]
    if len(evidence) < 3:
        limitations.append(
            f"Evidence packet is very small ({len(evidence)} item(s)); "
            "aggregates are dominated by individual sources."
        )

    state = WorldState(
        case_id=config.case_id,
        generated_at=utc_now(),
        cutoff_date=config.forecast_cutoff,
        target_actor=config.target_actor,
        target_organisation=config.target_organisation,
        evidence_count=len(evidence),
        claim_count=len(claims),
        actors=actors,
        claim_type_signals=signals,
        world_system_inputs=inputs,
        top_claims=top_claims,
        limitations=limitations,
        notes="Built by world_state_builder.py from extracted_claims.jsonl.",
    )

    issues = validate_world_state(state, claims, config.forecast_cutoff)
    write_world_state(case_dir, state)

    report = WorldStateBuildReport(
        case_id=config.case_id,
        generated_at=state.generated_at,
        evidence_count=len(evidence),
        claim_count=len(claims),
        actor_count=len(actors),
        claim_types_present=sorted(s.claim_type for s in signals),
        world_system_inputs=inputs,
        validation_issues=issues,
        notes="World-system inputs take the max weighted_score of their "
              "contributing claim types; see _WORLD_SYSTEM_SOURCES.",
    )
    (case_dir / REPORT_FILE).write_text(
        json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return state, report


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python world_state_builder.py <case_dir>")
        sys.exit(2)
    _, result = build_world_state(Path(sys.argv[1]))
    print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
