"""Leakage and completeness validation for Arrow Proof evidence items.

Mirrors LEAKAGE_CHECKLIST.md: every check returns structured
ValidationIssue objects so callers (ingestion, reports, later phases) can
act on them instead of parsing printed text.
"""

from __future__ import annotations

from datetime import datetime

from schemas import EvidenceItem, ValidationIssue


def validate_evidence_item(item: EvidenceItem, cutoff: datetime) -> list[ValidationIssue]:
    """Validate one evidence item against the case cutoff.

    Returns an empty list when the item is clean.
    """
    issues: list[ValidationIssue] = []

    def issue(severity: str, code: str, message: str, field_name: str | None = None) -> None:
        issues.append(ValidationIssue(
            severity=severity,
            code=code,
            message=message,
            evidence_id=item.evidence_id,
            field_name=field_name,
        ))

    if item.event_time is None:
        issue("error", "missing_event_time",
              f"{item.evidence_id}: event_time is required", "event_time")
    if item.knowledge_time is None:
        issue("error", "missing_knowledge_time",
              f"{item.evidence_id}: knowledge_time is required", "knowledge_time")
    elif item.included_in_forecast and item.knowledge_time > cutoff:
        issue("error", "knowledge_time_after_cutoff",
              f"{item.evidence_id}: knowledge_time {item.knowledge_time.isoformat()} "
              f"is after cutoff {cutoff.isoformat()} but the item is marked included",
              "knowledge_time")

    if not item.source_type.strip():
        issue("error", "missing_source_type",
              f"{item.evidence_id}: source_type is required", "source_type")
    if not item.source_name.strip():
        issue("error", "missing_source_name",
              f"{item.evidence_id}: source_name is required", "source_name")

    if not item.title.strip():
        issue("error", "missing_title",
              f"{item.evidence_id}: title is required", "title")
    if not item.text.strip():
        issue("error", "missing_text",
              f"{item.evidence_id}: text is empty", "text")

    # Included/excluded status must be explicit and internally consistent.
    if not item.included_in_forecast and not (item.exclusion_reason or "").strip():
        issue("error", "excluded_without_reason",
              f"{item.evidence_id}: excluded but no exclusion_reason recorded",
              "exclusion_reason")
    if item.included_in_forecast and (item.exclusion_reason or "").strip():
        issue("warning", "included_with_exclusion_reason",
              f"{item.evidence_id}: marked included but carries an exclusion_reason",
              "exclusion_reason")

    return issues


def validate_evidence(items: list[EvidenceItem], cutoff: datetime) -> list[ValidationIssue]:
    """Validate a whole evidence packet; also flags duplicate evidence ids."""
    issues: list[ValidationIssue] = []
    seen: set[str] = set()
    for item in items:
        if item.evidence_id in seen:
            issues.append(ValidationIssue(
                severity="error",
                code="duplicate_evidence_id",
                message=f"duplicate evidence_id: {item.evidence_id}",
                evidence_id=item.evidence_id,
            ))
        seen.add(item.evidence_id)
        issues.extend(validate_evidence_item(item, cutoff))
    return issues
