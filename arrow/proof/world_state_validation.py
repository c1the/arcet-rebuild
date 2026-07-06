"""Validation for built world states: internal consistency, claim
traceability, and the cutoff boundary."""

from __future__ import annotations

from datetime import datetime

from claim_schema import ExtractedClaim
from world_state_schema import WorldState, WorldStateValidationIssue


def validate_world_state(
    state: WorldState,
    claims: list[ExtractedClaim],
    cutoff: datetime,
) -> list[WorldStateValidationIssue]:
    """Validate one world state against the claims it was built from.

    Empty list means clean.
    """
    issues: list[WorldStateValidationIssue] = []

    def issue(severity: str, code: str, message: str, field_name: str | None = None) -> None:
        issues.append(WorldStateValidationIssue(
            severity=severity, code=code, message=message, field_name=field_name,
        ))

    if not (state.case_id or "").strip():
        issue("error", "missing_case_id", "world state has no case_id", "case_id")
    if state.cutoff_date is None:
        issue("error", "missing_cutoff_date", "world state has no cutoff_date", "cutoff_date")

    if state.claim_count != len(claims):
        issue("error", "claim_count_mismatch",
              f"world state claim_count={state.claim_count} but "
              f"extracted_claims.jsonl has {len(claims)} claims", "claim_count")

    known_ids = {c.claim_id for c in claims}

    for actor in state.actors:
        for cid in actor.supporting_claim_ids:
            if cid not in known_ids:
                issue("error", "unknown_supporting_claim_id",
                      f"actor {actor.actor!r} cites unknown claim_id {cid!r}", "actors")

    for signal in state.claim_type_signals:
        for cid in signal.supporting_claim_ids:
            if cid not in known_ids:
                issue("error", "unknown_supporting_claim_id",
                      f"claim_type_signal {signal.claim_type!r} cites unknown "
                      f"claim_id {cid!r}", "claim_type_signals")

    for entry in state.top_claims:
        if entry.get("claim_id") not in known_ids:
            issue("error", "unknown_top_claim_id",
                  f"top_claims references unknown claim_id {entry.get('claim_id')!r}",
                  "top_claims")

    # No claim behind this world state may be knowable after the cutoff.
    if state.cutoff_date is not None:
        for claim in claims:
            if claim.knowledge_time is not None and claim.knowledge_time > state.cutoff_date:
                issue("error", "claim_knowledge_time_after_cutoff",
                      f"claim {claim.claim_id} has knowledge_time "
                      f"{claim.knowledge_time.isoformat()} after cutoff "
                      f"{state.cutoff_date.isoformat()}")

    for name, value in state.world_system_inputs.to_dict().items():
        if not 0.0 <= value <= 1.0:
            issue("error", "world_system_input_out_of_range",
                  f"world_system_inputs.{name} = {value} outside [0, 1]",
                  "world_system_inputs")

    return issues
