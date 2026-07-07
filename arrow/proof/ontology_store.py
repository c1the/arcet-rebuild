"""Read/write ontology_snapshot.json for an Arrow Proof case directory."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from ontology_schema import OntologySnapshot
from schemas import utc_now

ONTOLOGY_FILE = "ontology_snapshot.json"


def read_ontology_snapshot(case_dir: Path) -> Optional[OntologySnapshot]:
    """Load ontology_snapshot.json, or None if absent / a template placeholder."""
    path = Path(case_dir) / ONTOLOGY_FILE
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if "_comment" in data or "case_id" not in data:
        return None  # placeholder, not a real snapshot
    return OntologySnapshot.from_dict(data)


def write_ontology_snapshot(case_dir: Path, snapshot: OntologySnapshot) -> None:
    """Write ontology_snapshot.json with stable, diff-friendly formatting."""
    path = Path(case_dir) / ONTOLOGY_FILE
    path.write_text(
        json.dumps(snapshot.to_dict(), indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def ensure_ontology_snapshot(
    case_dir: Path,
    case_id: str,
    cutoff_date: Optional[datetime],
) -> OntologySnapshot:
    """Return the case's snapshot, creating a minimal empty one if missing.

    The minimal snapshot carries only case_id and cutoff_date, so a case can
    run the full pipeline before anyone has curated ontology objects for it.
    """
    existing = read_ontology_snapshot(case_dir)
    if existing is not None:
        return existing
    snapshot = OntologySnapshot(
        case_id=case_id,
        generated_at=utc_now(),
        cutoff_date=cutoff_date,
        provenance_notes="Minimal empty snapshot auto-created by ontology_store; "
                         "no ontology objects curated yet.",
        limitations=["Empty snapshot: no entities, relationships, events, "
                     "issues, risks, or actions."],
    )
    write_ontology_snapshot(case_dir, snapshot)
    return snapshot
