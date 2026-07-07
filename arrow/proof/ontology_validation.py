"""Validation for ontology snapshots: identity, referential integrity,
the cutoff boundary, and numeric ranges."""

from __future__ import annotations

from ontology_schema import (
    ENTITY_TYPES,
    EVENT_TYPES,
    RELATIONSHIP_TYPES,
    OntologySnapshot,
    OntologyValidationIssue,
)


def validate_ontology_snapshot(snapshot: OntologySnapshot) -> list[OntologyValidationIssue]:
    """Validate one ontology snapshot. Empty list means clean."""
    issues: list[OntologyValidationIssue] = []

    def issue(severity: str, code: str, message: str,
              object_id: str | None = None, field_name: str | None = None) -> None:
        issues.append(OntologyValidationIssue(
            severity=severity, code=code, message=message,
            object_id=object_id, field_name=field_name,
        ))

    if not (snapshot.case_id or "").strip():
        issue("error", "missing_case_id", "snapshot has no case_id", None, "case_id")
    if snapshot.cutoff_date is None:
        issue("error", "missing_cutoff_date", "snapshot has no cutoff_date",
              None, "cutoff_date")

    # --- entities -----------------------------------------------------------
    entity_ids: set[str] = set()
    for entity in snapshot.entities:
        eid = entity.entity_id or "(no id)"
        if not (entity.entity_id or "").strip():
            issue("error", "missing_entity_id", "entity has no entity_id",
                  eid, "entity_id")
        elif entity.entity_id in entity_ids:
            issue("error", "duplicate_entity_id",
                  f"duplicate entity_id {entity.entity_id!r}", eid, "entity_id")
        entity_ids.add(entity.entity_id)
        if not (entity.entity_type or "").strip():
            issue("error", "missing_entity_type",
                  f"entity {eid}: no entity_type", eid, "entity_type")
        elif entity.entity_type not in ENTITY_TYPES:
            issue("warning", "unknown_entity_type",
                  f"entity {eid}: entity_type {entity.entity_type!r} is not in "
                  "the allowed set", eid, "entity_type")
        if not (entity.name or "").strip():
            issue("error", "missing_entity_name",
                  f"entity {eid}: no name", eid, "name")
        if not 0.0 <= entity.confidence <= 1.0:
            issue("error", "confidence_out_of_range",
                  f"entity {eid}: confidence {entity.confidence} outside [0, 1]",
                  eid, "confidence")

    def check_refs(object_id: str, kind: str, field_name: str, ids: list[str]) -> None:
        for ref in ids:
            if ref not in entity_ids:
                issue("error", "unknown_entity_ref",
                      f"{kind} {object_id}: {field_name} references unknown "
                      f"entity_id {ref!r}", object_id, field_name)

    # --- relationships ------------------------------------------------------
    for rel in snapshot.relationships:
        rid = rel.relationship_id or "(no id)"
        check_refs(rid, "relationship", "source_entity_id", [rel.source_entity_id])
        check_refs(rid, "relationship", "target_entity_id", [rel.target_entity_id])
        if rel.relationship_type not in RELATIONSHIP_TYPES:
            issue("warning", "unknown_relationship_type",
                  f"relationship {rid}: relationship_type "
                  f"{rel.relationship_type!r} is not in the allowed set",
                  rid, "relationship_type")
        if not 0.0 <= rel.strength <= 1.0:
            issue("error", "strength_out_of_range",
                  f"relationship {rid}: strength {rel.strength} outside [0, 1]",
                  rid, "strength")
        if not 0.0 <= rel.confidence <= 1.0:
            issue("error", "confidence_out_of_range",
                  f"relationship {rid}: confidence {rel.confidence} outside [0, 1]",
                  rid, "confidence")
        if (snapshot.cutoff_date is not None and rel.knowledge_time is not None
                and rel.knowledge_time > snapshot.cutoff_date):
            issue("error", "knowledge_time_after_cutoff",
                  f"relationship {rid}: knowledge_time "
                  f"{rel.knowledge_time.isoformat()} is after cutoff "
                  f"{snapshot.cutoff_date.isoformat()}", rid, "knowledge_time")

    # --- events ---------------------------------------------------------------
    for event in snapshot.events:
        vid = event.event_id or "(no id)"
        check_refs(vid, "event", "entity_ids", event.entity_ids)
        if event.event_type not in EVENT_TYPES:
            issue("warning", "unknown_event_type",
                  f"event {vid}: event_type {event.event_type!r} is not in "
                  "the allowed set", vid, "event_type")
        if not 0.0 <= event.confidence <= 1.0:
            issue("error", "confidence_out_of_range",
                  f"event {vid}: confidence {event.confidence} outside [0, 1]",
                  vid, "confidence")
        if (snapshot.cutoff_date is not None and event.knowledge_time is not None
                and event.knowledge_time > snapshot.cutoff_date):
            issue("error", "knowledge_time_after_cutoff",
                  f"event {vid}: knowledge_time "
                  f"{event.knowledge_time.isoformat()} is after cutoff "
                  f"{snapshot.cutoff_date.isoformat()}", vid, "knowledge_time")

    # --- risks and actions ----------------------------------------------------
    for risk in snapshot.risks:
        rid = risk.risk_id or "(no id)"
        check_refs(rid, "risk", "affected_entity_ids", risk.affected_entity_ids)
        if not 0.0 <= risk.confidence <= 1.0:
            issue("error", "confidence_out_of_range",
                  f"risk {rid}: confidence {risk.confidence} outside [0, 1]",
                  rid, "confidence")

    for action in snapshot.actions:
        aid = action.action_id or "(no id)"
        check_refs(aid, "action", "target_entity_ids", action.target_entity_ids)

    return issues
