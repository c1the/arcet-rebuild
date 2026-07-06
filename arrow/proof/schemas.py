"""Dataclass schemas for the Arrow Proof Phase 1 evidence pipeline.

Plain dataclasses (no external dependencies) so the pipeline runs with any
Python 3.10+ interpreter. All timestamps are timezone-aware datetimes; naive
inputs are assumed UTC.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


# --------------------------------------------------------------------------
# Datetime helpers
# --------------------------------------------------------------------------

def parse_dt(value: Any) -> Optional[datetime]:
    """Parse an ISO 8601 string into an aware UTC datetime.

    Accepts date-only strings (midnight UTC) and a trailing ``Z``.
    Returns None for None/empty input. Raises ValueError on garbage.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def iso(dt: Optional[datetime]) -> Optional[str]:
    """Render an optional datetime back to ISO 8601 (or None)."""
    return dt.isoformat() if dt is not None else None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# Case configuration
# --------------------------------------------------------------------------

@dataclass
class CaseConfig:
    """Frozen definition of one historical forecasting case."""

    case_id: str
    event_name: str
    event_type: str
    target_actor: str
    target_organisation: str
    country_jurisdiction: str
    prediction_question: str
    forecast_cutoff: datetime
    outcome_classes: list[str]
    positive_outcome_definition: str
    negative_outcome_definition: str
    data_window_start: Optional[datetime] = None
    data_window_end: Optional[datetime] = None
    forecast_horizon_days: Optional[int] = None
    actual_event_date: Optional[str] = None  # kept opaque: never parsed pre-lock
    allowed_sources: list[str] = field(default_factory=list)
    excluded_sources: list[str] = field(default_factory=list)
    known_limitations: list[str] = field(default_factory=list)
    status: str = "defined"
    frozen_at: Optional[str] = None
    frozen_by: Optional[str] = None


# --------------------------------------------------------------------------
# Manifest
# --------------------------------------------------------------------------

@dataclass
class DataManifestRow:
    """One row of data_manifest.csv — a candidate source, kept or excluded."""

    source_id: str
    title: str
    source_type: str
    publisher: str
    url_or_location: str
    event_time: Optional[datetime]
    knowledge_time: Optional[datetime]
    retrieved_at: Optional[datetime]
    status: str  # "included" | "excluded"
    exclusion_reason: str
    raw_file: str
    notes: str


# --------------------------------------------------------------------------
# Evidence
# --------------------------------------------------------------------------

@dataclass
class EvidenceItem:
    """A single dated evidence record derived from one manifest source."""

    evidence_id: str
    case_id: str
    title: str
    source_type: str
    source_name: str
    source_url_or_ref: str
    event_time: Optional[datetime]
    knowledge_time: Optional[datetime]
    ingested_at: datetime
    text: str
    entities: list[str] = field(default_factory=list)
    reliability_tier: str = "unrated"  # e.g. primary / mainstream / partisan / unrated
    included_in_forecast: bool = True
    exclusion_reason: Optional[str] = None
    raw_file_path: Optional[str] = None
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "case_id": self.case_id,
            "title": self.title,
            "source_type": self.source_type,
            "source_name": self.source_name,
            "source_url_or_ref": self.source_url_or_ref,
            "event_time": iso(self.event_time),
            "knowledge_time": iso(self.knowledge_time),
            "ingested_at": iso(self.ingested_at),
            "text": self.text,
            "entities": self.entities,
            "reliability_tier": self.reliability_tier,
            "included_in_forecast": self.included_in_forecast,
            "exclusion_reason": self.exclusion_reason,
            "raw_file_path": self.raw_file_path,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "EvidenceItem":
        return cls(
            evidence_id=d["evidence_id"],
            case_id=d["case_id"],
            title=d.get("title", ""),
            source_type=d.get("source_type", ""),
            source_name=d.get("source_name", ""),
            source_url_or_ref=d.get("source_url_or_ref", ""),
            event_time=parse_dt(d.get("event_time")),
            knowledge_time=parse_dt(d.get("knowledge_time")),
            ingested_at=parse_dt(d.get("ingested_at")) or utc_now(),
            text=d.get("text", ""),
            entities=list(d.get("entities") or []),
            reliability_tier=d.get("reliability_tier", "unrated"),
            included_in_forecast=bool(d.get("included_in_forecast", True)),
            exclusion_reason=d.get("exclusion_reason"),
            raw_file_path=d.get("raw_file_path"),
            notes=d.get("notes", ""),
        )


# --------------------------------------------------------------------------
# Validation and reporting
# --------------------------------------------------------------------------

@dataclass
class ValidationIssue:
    """A structured problem found while validating a source or evidence item."""

    severity: str          # "error" | "warning"
    code: str              # machine-readable, e.g. "missing_knowledge_time"
    message: str           # human-readable explanation
    source_id: Optional[str] = None
    evidence_id: Optional[str] = None
    field_name: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "source_id": self.source_id,
            "evidence_id": self.evidence_id,
            "field_name": self.field_name,
        }


@dataclass
class IngestionReport:
    """Summary of one ingestion run over a case directory."""

    case_id: str
    total_sources: int
    included_count: int
    excluded_count: int
    exclusion_reasons: dict[str, str]  # source_id -> reason
    validation_issues: list[ValidationIssue]
    cutoff_date: datetime
    generated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "total_sources": self.total_sources,
            "included_count": self.included_count,
            "excluded_count": self.excluded_count,
            "exclusion_reasons": self.exclusion_reasons,
            "validation_issues": [i.to_dict() for i in self.validation_issues],
            "cutoff_date": iso(self.cutoff_date),
            "generated_at": iso(self.generated_at),
        }
