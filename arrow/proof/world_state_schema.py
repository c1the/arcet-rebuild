"""Dataclass schemas for Arrow Proof Phase 3 world-state building.

The world state is a point-in-time political situation snapshot aggregated
from extracted claims. All scores here are HEURISTIC AGGREGATES of keyword
extraction output — transparent arithmetic, not calibrated probabilities.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from schemas import iso, parse_dt


@dataclass
class ActorState:
    """Aggregated signal for one actor appearing in the claims."""

    actor: str
    claim_count: int
    average_strength: float
    average_confidence: float
    dominant_claim_types: list[str]
    supporting_claim_ids: list[str]
    pressure_score: float   # 0..1 heuristic: how much pressure bears on/through this actor
    notes: str = ""
    # Phase 4.5 ontology linkage — empty/None for unresolved (fallback) actors.
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None
    name: str = ""
    relationship_ids: list[str] = field(default_factory=list)
    event_ids: list[str] = field(default_factory=list)
    risk_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "actor": self.actor,
            "claim_count": self.claim_count,
            "average_strength": self.average_strength,
            "average_confidence": self.average_confidence,
            "dominant_claim_types": self.dominant_claim_types,
            "supporting_claim_ids": self.supporting_claim_ids,
            "pressure_score": self.pressure_score,
            "notes": self.notes,
            "entity_id": self.entity_id,
            "entity_type": self.entity_type,
            "name": self.name,
            "relationship_ids": self.relationship_ids,
            "event_ids": self.event_ids,
            "risk_ids": self.risk_ids,
        }


@dataclass
class ClaimTypeSignal:
    """Aggregated signal for one claim type across the whole packet."""

    claim_type: str
    claim_count: int
    average_strength: float
    average_confidence: float
    weighted_score: float   # average_strength * average_confidence
    supporting_claim_ids: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim_type": self.claim_type,
            "claim_count": self.claim_count,
            "average_strength": self.average_strength,
            "average_confidence": self.average_confidence,
            "weighted_score": self.weighted_score,
            "supporting_claim_ids": self.supporting_claim_ids,
        }


@dataclass
class WorldSystemInputs:
    """Six 0..1 inputs for the future Phase 4 world-system models."""

    incentive: float = 0.0           # electoral_pressure, polling_decline
    faction: float = 0.0             # faction_alignment, elite_signal, leadership_opposition
    ideology: float = 0.0            # ideological_conflict
    network_contagion: float = 0.0   # network_signal, relationship_break, relationship_support
    institutional: float = 0.0       # institutional_constraint
    media_pressure: float = 0.0      # media_pressure, scandal_pressure, public_dissent

    def to_dict(self) -> dict[str, float]:
        return {
            "incentive": self.incentive,
            "faction": self.faction,
            "ideology": self.ideology,
            "network_contagion": self.network_contagion,
            "institutional": self.institutional,
            "media_pressure": self.media_pressure,
        }


@dataclass
class WorldState:
    """Point-in-time political situation snapshot for one case."""

    case_id: str
    generated_at: datetime
    cutoff_date: datetime
    target_actor: str
    target_organisation: str
    evidence_count: int
    claim_count: int
    actors: list[ActorState]
    claim_type_signals: list[ClaimTypeSignal]
    world_system_inputs: WorldSystemInputs
    top_claims: list[dict]           # [{claim_id, claim_type, weighted_score, text_span}]
    limitations: list[str] = field(default_factory=list)
    notes: str = ""
    # Phase 4.5 ontology snapshot summary.
    ontology_snapshot_used: bool = False
    ontology_entity_count: int = 0
    ontology_relationship_count: int = 0
    ontology_event_count: int = 0
    ontology_risk_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "generated_at": iso(self.generated_at),
            "cutoff_date": iso(self.cutoff_date),
            "target_actor": self.target_actor,
            "target_organisation": self.target_organisation,
            "evidence_count": self.evidence_count,
            "claim_count": self.claim_count,
            "actors": [a.to_dict() for a in self.actors],
            "claim_type_signals": [s.to_dict() for s in self.claim_type_signals],
            "world_system_inputs": self.world_system_inputs.to_dict(),
            "top_claims": self.top_claims,
            "limitations": self.limitations,
            "notes": self.notes,
            "ontology_snapshot_used": self.ontology_snapshot_used,
            "ontology_entity_count": self.ontology_entity_count,
            "ontology_relationship_count": self.ontology_relationship_count,
            "ontology_event_count": self.ontology_event_count,
            "ontology_risk_count": self.ontology_risk_count,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "WorldState":
        return cls(
            case_id=d["case_id"],
            generated_at=parse_dt(d.get("generated_at")),
            cutoff_date=parse_dt(d.get("cutoff_date")),
            target_actor=d.get("target_actor", ""),
            target_organisation=d.get("target_organisation", ""),
            evidence_count=int(d.get("evidence_count") or 0),
            claim_count=int(d.get("claim_count") or 0),
            actors=[ActorState(**a) for a in d.get("actors") or []],
            claim_type_signals=[ClaimTypeSignal(**s) for s in d.get("claim_type_signals") or []],
            world_system_inputs=WorldSystemInputs(**(d.get("world_system_inputs") or {})),
            top_claims=list(d.get("top_claims") or []),
            limitations=list(d.get("limitations") or []),
            notes=d.get("notes", ""),
            ontology_snapshot_used=bool(d.get("ontology_snapshot_used", False)),
            ontology_entity_count=int(d.get("ontology_entity_count") or 0),
            ontology_relationship_count=int(d.get("ontology_relationship_count") or 0),
            ontology_event_count=int(d.get("ontology_event_count") or 0),
            ontology_risk_count=int(d.get("ontology_risk_count") or 0),
        )


@dataclass
class WorldStateValidationIssue:
    """A structured problem found while validating a world state."""

    severity: str          # "error" | "warning"
    code: str
    message: str
    field_name: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "field_name": self.field_name,
        }


@dataclass
class WorldStateBuildReport:
    """Summary of one world-state build over a case directory."""

    case_id: str
    generated_at: datetime
    evidence_count: int
    claim_count: int
    actor_count: int
    claim_types_present: list[str]
    world_system_inputs: WorldSystemInputs
    validation_issues: list[WorldStateValidationIssue] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "generated_at": iso(self.generated_at),
            "evidence_count": self.evidence_count,
            "claim_count": self.claim_count,
            "actor_count": self.actor_count,
            "claim_types_present": self.claim_types_present,
            "world_system_inputs": self.world_system_inputs.to_dict(),
            "validation_issues": [i.to_dict() for i in self.validation_issues],
            "notes": self.notes,
        }
