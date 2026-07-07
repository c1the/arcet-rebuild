"""Dataclass schemas for the Arrow Proof Phase 4.5 runtime ontology layer.

Local Arcet-style ontology snapshots: political objects (people, organisations,
factions, issues, relationships, events, risks, actions) held in one
point-in-time ``ontology_snapshot.json`` per case. Same conventions as
schemas.py: plain dataclasses, aware UTC datetimes, to_dict/from_dict for JSON
round-tripping. No database, no network, no LLM — this is the local-file stand-in
for the future platform API / point-in-time store adapter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from schemas import iso, parse_dt

# Closed vocabularies mirroring the Arcet platform ontology.
ENTITY_TYPES = frozenset({
    "Person",
    "Organisation",
    "Constituency",
    "Candidate",
    "Issue",
    "Faction",
    "MediaOutlet",
    "Donor",
    "Unknown",
})

RELATIONSHIP_TYPES = frozenset({
    "knows",
    "influences",
    "supports",
    "opposes",
    "funds",
    "advises",
    "represents",
    "belongs_to",
    "has_access_to",
    "owes_commitment_to",
    "hostile_to",
    "aligned_with",
    "sensitive_relationship",
    "mentions",
})

EVENT_TYPES = frozenset({
    "meeting",
    "call",
    "email",
    "public_statement",
    "endorsement",
    "donation",
    "press_article",
    "selection_event",
    "policy_announcement",
    "campaign_visit",
    "controversy",
    "vote",
    "debate",
    "local_incident",
    "leadership_challenge",
    "resignation",
    "defection",
    "rebellion",
    "other",
})


@dataclass
class OntologyEntity:
    """One Arcet-style political object: person, organisation, faction, etc."""

    entity_id: str
    entity_type: str                # one of ENTITY_TYPES
    name: str
    aliases: list[str] = field(default_factory=list)
    role: str = ""
    organisation_id: Optional[str] = None
    constituency_id: Optional[str] = None
    issue_ids: list[str] = field(default_factory=list)
    faction_alignment: str = ""
    confidence: float = 0.0
    source_refs: list[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "entity_type": self.entity_type,
            "name": self.name,
            "aliases": self.aliases,
            "role": self.role,
            "organisation_id": self.organisation_id,
            "constituency_id": self.constituency_id,
            "issue_ids": self.issue_ids,
            "faction_alignment": self.faction_alignment,
            "confidence": self.confidence,
            "source_refs": self.source_refs,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologyEntity":
        return cls(
            entity_id=d.get("entity_id", ""),
            entity_type=d.get("entity_type", "Unknown"),
            name=d.get("name", ""),
            aliases=list(d.get("aliases") or []),
            role=d.get("role", ""),
            organisation_id=d.get("organisation_id"),
            constituency_id=d.get("constituency_id"),
            issue_ids=list(d.get("issue_ids") or []),
            faction_alignment=d.get("faction_alignment", ""),
            confidence=float(d.get("confidence") or 0.0),
            source_refs=list(d.get("source_refs") or []),
            notes=d.get("notes", ""),
        )


@dataclass
class OntologyRelationship:
    """A typed, dated edge between two ontology entities."""

    relationship_id: str
    source_entity_id: str
    target_entity_id: str
    relationship_type: str          # one of RELATIONSHIP_TYPES
    strength: float = 0.0           # 0..1
    attitude: str = ""              # e.g. hostile / supportive / neutral
    influence_level: str = ""       # e.g. low / medium / high
    confidence: float = 0.0
    event_time: Optional[datetime] = None
    knowledge_time: Optional[datetime] = None
    evidence_ids: list[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "relationship_id": self.relationship_id,
            "source_entity_id": self.source_entity_id,
            "target_entity_id": self.target_entity_id,
            "relationship_type": self.relationship_type,
            "strength": self.strength,
            "attitude": self.attitude,
            "influence_level": self.influence_level,
            "confidence": self.confidence,
            "event_time": iso(self.event_time),
            "knowledge_time": iso(self.knowledge_time),
            "evidence_ids": self.evidence_ids,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologyRelationship":
        return cls(
            relationship_id=d.get("relationship_id", ""),
            source_entity_id=d.get("source_entity_id", ""),
            target_entity_id=d.get("target_entity_id", ""),
            relationship_type=d.get("relationship_type", ""),
            strength=float(d.get("strength") or 0.0),
            attitude=d.get("attitude", ""),
            influence_level=d.get("influence_level", ""),
            confidence=float(d.get("confidence") or 0.0),
            event_time=parse_dt(d.get("event_time")),
            knowledge_time=parse_dt(d.get("knowledge_time")),
            evidence_ids=list(d.get("evidence_ids") or []),
            notes=d.get("notes", ""),
        )


@dataclass
class OntologyEvent:
    """A dated political event linking entities, issues, and evidence."""

    event_id: str
    event_type: str                 # one of EVENT_TYPES
    title: str
    date: Optional[datetime] = None
    knowledge_time: Optional[datetime] = None
    entity_ids: list[str] = field(default_factory=list)
    issue_ids: list[str] = field(default_factory=list)
    constituency_ids: list[str] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)
    summary: str = ""
    confidence: float = 0.0
    source_refs: list[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "title": self.title,
            "date": iso(self.date),
            "knowledge_time": iso(self.knowledge_time),
            "entity_ids": self.entity_ids,
            "issue_ids": self.issue_ids,
            "constituency_ids": self.constituency_ids,
            "evidence_ids": self.evidence_ids,
            "summary": self.summary,
            "confidence": self.confidence,
            "source_refs": self.source_refs,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologyEvent":
        return cls(
            event_id=d.get("event_id", ""),
            event_type=d.get("event_type", "other"),
            title=d.get("title", ""),
            date=parse_dt(d.get("date")),
            knowledge_time=parse_dt(d.get("knowledge_time")),
            entity_ids=list(d.get("entity_ids") or []),
            issue_ids=list(d.get("issue_ids") or []),
            constituency_ids=list(d.get("constituency_ids") or []),
            evidence_ids=list(d.get("evidence_ids") or []),
            summary=d.get("summary", ""),
            confidence=float(d.get("confidence") or 0.0),
            source_refs=list(d.get("source_refs") or []),
            notes=d.get("notes", ""),
        )


@dataclass
class OntologyIssue:
    """A political issue the case's entities and events revolve around."""

    issue_id: str
    name: str
    description: str = ""
    category: str = ""
    salience: float = 0.0           # 0..1, how live the issue is in this case
    entity_ids: list[str] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    source_refs: list[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "issue_id": self.issue_id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "salience": self.salience,
            "entity_ids": self.entity_ids,
            "evidence_ids": self.evidence_ids,
            "confidence": self.confidence,
            "source_refs": self.source_refs,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologyIssue":
        return cls(
            issue_id=d.get("issue_id", ""),
            name=d.get("name", ""),
            description=d.get("description", ""),
            category=d.get("category", ""),
            salience=float(d.get("salience") or 0.0),
            entity_ids=list(d.get("entity_ids") or []),
            evidence_ids=list(d.get("evidence_ids") or []),
            confidence=float(d.get("confidence") or 0.0),
            source_refs=list(d.get("source_refs") or []),
            notes=d.get("notes", ""),
        )


@dataclass
class OntologyRisk:
    """An identified political risk bearing on one or more entities."""

    risk_id: str
    risk_type: str
    severity: str = ""              # e.g. low / medium / high / critical
    urgency: str = ""               # e.g. low / medium / high
    affected_entity_ids: list[str] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    recommended_mitigation: str = ""
    owner: str = ""
    status: str = "open"
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "risk_id": self.risk_id,
            "risk_type": self.risk_type,
            "severity": self.severity,
            "urgency": self.urgency,
            "affected_entity_ids": self.affected_entity_ids,
            "evidence_ids": self.evidence_ids,
            "confidence": self.confidence,
            "recommended_mitigation": self.recommended_mitigation,
            "owner": self.owner,
            "status": self.status,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologyRisk":
        return cls(
            risk_id=d.get("risk_id", ""),
            risk_type=d.get("risk_type", ""),
            severity=d.get("severity", ""),
            urgency=d.get("urgency", ""),
            affected_entity_ids=list(d.get("affected_entity_ids") or []),
            evidence_ids=list(d.get("evidence_ids") or []),
            confidence=float(d.get("confidence") or 0.0),
            recommended_mitigation=d.get("recommended_mitigation", ""),
            owner=d.get("owner", ""),
            status=d.get("status", "open"),
            notes=d.get("notes", ""),
        )


@dataclass
class OntologyAction:
    """A recommended or taken action, usually mitigating a risk."""

    action_id: str
    action_type: str
    owner: str = ""
    target_entity_ids: list[str] = field(default_factory=list)
    due_date: Optional[datetime] = None
    priority: str = ""              # e.g. low / medium / high
    rationale: str = ""
    related_risk_ids: list[str] = field(default_factory=list)
    approval_status: str = "proposed"
    completion_status: str = "not_started"
    outcome: str = ""
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "action_type": self.action_type,
            "owner": self.owner,
            "target_entity_ids": self.target_entity_ids,
            "due_date": iso(self.due_date),
            "priority": self.priority,
            "rationale": self.rationale,
            "related_risk_ids": self.related_risk_ids,
            "approval_status": self.approval_status,
            "completion_status": self.completion_status,
            "outcome": self.outcome,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologyAction":
        return cls(
            action_id=d.get("action_id", ""),
            action_type=d.get("action_type", ""),
            owner=d.get("owner", ""),
            target_entity_ids=list(d.get("target_entity_ids") or []),
            due_date=parse_dt(d.get("due_date")),
            priority=d.get("priority", ""),
            rationale=d.get("rationale", ""),
            related_risk_ids=list(d.get("related_risk_ids") or []),
            approval_status=d.get("approval_status", "proposed"),
            completion_status=d.get("completion_status", "not_started"),
            outcome=d.get("outcome", ""),
            notes=d.get("notes", ""),
        )


@dataclass
class OntologySnapshot:
    """Point-in-time Arcet-style ontology for one case, cut at the forecast
    cutoff. Everything inside must be knowable at or before ``cutoff_date``."""

    case_id: str
    generated_at: Optional[datetime] = None
    cutoff_date: Optional[datetime] = None
    entities: list[OntologyEntity] = field(default_factory=list)
    relationships: list[OntologyRelationship] = field(default_factory=list)
    events: list[OntologyEvent] = field(default_factory=list)
    issues: list[OntologyIssue] = field(default_factory=list)
    risks: list[OntologyRisk] = field(default_factory=list)
    actions: list[OntologyAction] = field(default_factory=list)
    provenance_notes: str = ""
    limitations: list[str] = field(default_factory=list)

    def entity_by_id(self, entity_id: str) -> Optional[OntologyEntity]:
        for entity in self.entities:
            if entity.entity_id == entity_id:
                return entity
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "generated_at": iso(self.generated_at),
            "cutoff_date": iso(self.cutoff_date),
            "entities": [e.to_dict() for e in self.entities],
            "relationships": [r.to_dict() for r in self.relationships],
            "events": [e.to_dict() for e in self.events],
            "issues": [i.to_dict() for i in self.issues],
            "risks": [r.to_dict() for r in self.risks],
            "actions": [a.to_dict() for a in self.actions],
            "provenance_notes": self.provenance_notes,
            "limitations": self.limitations,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OntologySnapshot":
        return cls(
            case_id=d.get("case_id", ""),
            generated_at=parse_dt(d.get("generated_at")),
            cutoff_date=parse_dt(d.get("cutoff_date")),
            entities=[OntologyEntity.from_dict(e) for e in d.get("entities") or []],
            relationships=[OntologyRelationship.from_dict(r) for r in d.get("relationships") or []],
            events=[OntologyEvent.from_dict(e) for e in d.get("events") or []],
            issues=[OntologyIssue.from_dict(i) for i in d.get("issues") or []],
            risks=[OntologyRisk.from_dict(r) for r in d.get("risks") or []],
            actions=[OntologyAction.from_dict(a) for a in d.get("actions") or []],
            provenance_notes=d.get("provenance_notes", ""),
            limitations=list(d.get("limitations") or []),
        )


@dataclass
class OntologyValidationIssue:
    """A structured problem found while validating an ontology snapshot."""

    severity: str          # "error" | "warning"
    code: str
    message: str
    object_id: Optional[str] = None
    field_name: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "object_id": self.object_id,
            "field_name": self.field_name,
        }


@dataclass
class OntologyResolutionResult:
    """Outcome of resolving one free-text actor/target string to an entity."""

    input_text: str
    resolved_entity_id: Optional[str] = None
    resolved_entity_type: Optional[str] = None
    confidence: float = 0.0
    method: str = "unresolved"   # exact_name | alias | name_case_insensitive | unresolved
    notes: str = ""

    @property
    def resolved(self) -> bool:
        return self.resolved_entity_id is not None

    def to_dict(self) -> dict[str, Any]:
        return {
            "input_text": self.input_text,
            "resolved_entity_id": self.resolved_entity_id,
            "resolved_entity_type": self.resolved_entity_type,
            "confidence": self.confidence,
            "method": self.method,
            "notes": self.notes,
        }
