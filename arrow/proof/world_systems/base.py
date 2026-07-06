"""Shared dataclasses, interface, and v0 heuristics for world systems.

Scoring (v0, transparent by design):
    score      = the relevant world_system_input (already 0..1)
    confidence = min(0.85, 0.35 + 0.5 * score + evidence bonus)
    direction  = score >= 0.6  -> event_more_likely
                 score >= 0.25 -> mixed
                 score >  0    -> mixed if >= 2 claims, else insufficient_signal
                 near zero     -> insufficient_signal (confidence 0.2)
Confidence is capped at 0.85: no keyword-derived heuristic earns more.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from world_state_schema import WorldState

DIRECTIONS = frozenset({
    "event_more_likely",
    "event_less_likely",
    "mixed",
    "insufficient_signal",
})

# Below this input level a system declines to read a signal at all.
NEAR_ZERO = 0.05
INSUFFICIENT_CONFIDENCE = 0.2

STANDARD_LIMITATION = (
    "Theory-specific heuristic assessment derived from keyword-extracted "
    "claims; not a calibrated probability and not the Arrow forecast."
)


@dataclass
class WorldSystemEvidenceLink:
    """Pointer to a claim already present in the world state (never invented)."""

    claim_id: str
    claim_type: str
    weighted_score: float
    text_span: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim_id": self.claim_id,
            "claim_type": self.claim_type,
            "weighted_score": self.weighted_score,
            "text_span": self.text_span,
        }


@dataclass
class WorldSystemResult:
    """One theory's partial assessment of the case."""

    system_name: str
    system_version: str
    case_id: str
    score: float                # 0..1 signal level read by this theory
    confidence: float           # 0..1 how much the theory trusts its own reading
    direction: str              # one of DIRECTIONS
    reasoning_summary: str
    supporting_claim_ids: list[str] = field(default_factory=list)
    top_evidence: list[WorldSystemEvidenceLink] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "system_name": self.system_name,
            "system_version": self.system_version,
            "case_id": self.case_id,
            "score": self.score,
            "confidence": self.confidence,
            "direction": self.direction,
            "reasoning_summary": self.reasoning_summary,
            "supporting_claim_ids": self.supporting_claim_ids,
            "top_evidence": [e.to_dict() for e in self.top_evidence],
            "limitations": self.limitations,
            "notes": self.notes,
        }


@dataclass
class WorldSystemValidationIssue:
    """A structured problem found while validating world-system results."""

    severity: str          # "error" | "warning"
    code: str
    message: str
    system_name: Optional[str] = None
    field_name: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "system_name": self.system_name,
            "field_name": self.field_name,
        }


class WorldSystem(Protocol):
    """Interface every world system satisfies."""

    name: str
    version: str

    def assess(self, state: WorldState) -> WorldSystemResult:
        ...


# --------------------------------------------------------------------------
# Shared v0 heuristics
# --------------------------------------------------------------------------

def collect_supporting(
    state: WorldState, claim_types: set[str]
) -> tuple[list[str], list[WorldSystemEvidenceLink]]:
    """Claim ids and evidence links for the given claim types, taken ONLY from
    the world state's claim_type_signals and top_claims."""
    claim_ids: list[str] = []
    for signal in state.claim_type_signals:
        if signal.claim_type in claim_types:
            claim_ids.extend(signal.supporting_claim_ids)

    links = [
        WorldSystemEvidenceLink(
            claim_id=entry["claim_id"],
            claim_type=entry["claim_type"],
            weighted_score=entry.get("weighted_score", 0.0),
            text_span=entry.get("text_span", ""),
        )
        for entry in state.top_claims
        if entry.get("claim_type") in claim_types
    ]
    return claim_ids, links


def default_confidence(score: float, claim_count: int) -> float:
    """v0 confidence: base 0.35, grows with signal, small evidence bonus."""
    bonus = min(0.05, 0.01 * claim_count)
    return round(min(0.85, 0.35 + 0.5 * score + bonus), 3)


def default_direction(score: float, claim_count: int) -> str:
    if score >= 0.6:
        return "event_more_likely"
    if score >= 0.25:
        return "mixed"
    if score > NEAR_ZERO:
        return "mixed" if claim_count >= 2 else "insufficient_signal"
    return "insufficient_signal"


def standard_result(
    system_name: str,
    system_version: str,
    state: WorldState,
    score: float,
    claim_types: set[str],
    reasoning: str,
    direction: str | None = None,
    extra_limitations: list[str] | None = None,
) -> WorldSystemResult:
    """Assemble a result using the shared v0 heuristics.

    With no claims at all, or a near-zero input, the system declines to read
    a signal: insufficient_signal at low confidence, citing nothing.
    """
    claim_ids, links = collect_supporting(state, claim_types)

    if state.claim_count == 0 or score <= NEAR_ZERO:
        return WorldSystemResult(
            system_name=system_name,
            system_version=system_version,
            case_id=state.case_id,
            score=round(score, 3),
            confidence=INSUFFICIENT_CONFIDENCE,
            direction="insufficient_signal",
            reasoning_summary=(
                f"{reasoning} No usable signal: "
                + ("the case has no extracted claims." if state.claim_count == 0
                   else f"the input level ({score:.3f}) is near zero.")
            ),
            supporting_claim_ids=claim_ids,
            top_evidence=links,
            limitations=[STANDARD_LIMITATION] + (extra_limitations or []),
        )

    return WorldSystemResult(
        system_name=system_name,
        system_version=system_version,
        case_id=state.case_id,
        score=round(score, 3),
        confidence=default_confidence(score, len(claim_ids)),
        direction=direction or default_direction(score, len(claim_ids)),
        reasoning_summary=reasoning,
        supporting_claim_ids=claim_ids,
        top_evidence=links,
        limitations=[STANDARD_LIMITATION] + (extra_limitations or []),
    )
