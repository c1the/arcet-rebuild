"""Validation for extracted claims, mirroring the leakage rules in
LEAKAGE_CHECKLIST.md at the claim level."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from claim_schema import CLAIM_TYPES, ClaimValidationIssue, ExtractedClaim


def validate_claim(
    claim: ExtractedClaim,
    cutoff: datetime,
    known_evidence_ids: Optional[set[str]] = None,
) -> list[ClaimValidationIssue]:
    """Validate one claim. Empty list means the claim is clean.

    ``known_evidence_ids``, when given, is the set of ids in the included
    evidence packet — a claim pointing anywhere else is an error (it would
    mean a claim was extracted from excluded or unknown evidence).
    """
    issues: list[ClaimValidationIssue] = []

    def issue(severity: str, code: str, message: str, field_name: str | None = None) -> None:
        issues.append(ClaimValidationIssue(
            severity=severity, code=code, message=message,
            claim_id=claim.claim_id or None, field_name=field_name,
        ))

    if not (claim.claim_id or "").strip():
        issue("error", "missing_claim_id", "claim has no claim_id", "claim_id")

    if not (claim.evidence_id or "").strip():
        issue("error", "missing_evidence_id",
              f"{claim.claim_id}: no evidence_id — every claim must trace to evidence",
              "evidence_id")
    elif known_evidence_ids is not None and claim.evidence_id not in known_evidence_ids:
        issue("error", "unknown_evidence_id",
              f"{claim.claim_id}: evidence_id {claim.evidence_id!r} is not in the "
              "included evidence packet", "evidence_id")

    if claim.claim_type not in CLAIM_TYPES:
        issue("error", "unknown_claim_type",
              f"{claim.claim_id}: unknown claim_type {claim.claim_type!r}", "claim_type")

    if not 0.0 <= claim.strength <= 1.0:
        issue("error", "strength_out_of_range",
              f"{claim.claim_id}: strength {claim.strength} outside [0, 1]", "strength")
    if not 0.0 <= claim.confidence <= 1.0:
        issue("error", "confidence_out_of_range",
              f"{claim.claim_id}: confidence {claim.confidence} outside [0, 1]", "confidence")

    if claim.event_time is None:
        issue("error", "missing_event_time",
              f"{claim.claim_id}: event_time is required", "event_time")
    if claim.knowledge_time is None:
        issue("error", "missing_knowledge_time",
              f"{claim.claim_id}: knowledge_time is required", "knowledge_time")
    elif claim.knowledge_time > cutoff:
        issue("error", "knowledge_time_after_cutoff",
              f"{claim.claim_id}: knowledge_time {claim.knowledge_time.isoformat()} "
              f"is after case cutoff {cutoff.isoformat()}", "knowledge_time")

    if not (claim.text_span or "").strip():
        issue("error", "empty_text_span",
              f"{claim.claim_id}: text_span is empty — claims must quote their evidence",
              "text_span")

    return issues


def validate_claims(
    claims: list[ExtractedClaim],
    cutoff: datetime,
    known_evidence_ids: Optional[set[str]] = None,
) -> list[ClaimValidationIssue]:
    """Validate a claim set; also flags duplicate claim ids."""
    issues: list[ClaimValidationIssue] = []
    seen: set[str] = set()
    for claim in claims:
        if claim.claim_id in seen:
            issues.append(ClaimValidationIssue(
                severity="error", code="duplicate_claim_id",
                message=f"duplicate claim_id: {claim.claim_id}", claim_id=claim.claim_id,
            ))
        seen.add(claim.claim_id)
        issues.extend(validate_claim(claim, cutoff, known_evidence_ids))
    return issues
