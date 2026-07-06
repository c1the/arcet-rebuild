"""Phase 1 ingestion: data_manifest.csv + raw_sources/ -> evidence.jsonl.

Reads the manifest of a case directory, turns each row into an EvidenceItem,
applies the cutoff and manifest exclusions, validates everything, and writes:

- evidence.jsonl            included evidence only
- excluded_evidence.jsonl   excluded evidence with reasons
- ingestion_report.json     counts, reasons, validation issues

Usage:  python ingestion.py <case_dir>
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from case_store import load_case_config
from evidence_store import write_evidence, write_excluded_evidence
from schemas import (
    DataManifestRow,
    EvidenceItem,
    IngestionReport,
    ValidationIssue,
    parse_dt,
    utc_now,
)
from validation import validate_evidence

MANIFEST_FILE = "data_manifest.csv"
REPORT_FILE = "ingestion_report.json"


def read_manifest(case_dir: Path) -> list[DataManifestRow]:
    """Parse data_manifest.csv into typed rows. Unparseable dates become None."""
    path = Path(case_dir) / MANIFEST_FILE
    if not path.is_file():
        raise FileNotFoundError(f"No {MANIFEST_FILE} in {case_dir}")

    rows: list[DataManifestRow] = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for record in csv.DictReader(fh):
            if not (record.get("source_id") or "").strip():
                continue  # skip blank lines
            rows.append(DataManifestRow(
                source_id=record["source_id"].strip(),
                title=(record.get("title") or "").strip(),
                source_type=(record.get("source_type") or "").strip(),
                publisher=(record.get("publisher") or "").strip(),
                url_or_location=(record.get("url_or_location") or "").strip(),
                event_time=_safe_dt(record.get("event_time")),
                knowledge_time=_safe_dt(record.get("knowledge_time")),
                retrieved_at=_safe_dt(record.get("retrieved_at")),
                status=(record.get("status") or "").strip().lower(),
                exclusion_reason=(record.get("exclusion_reason") or "").strip(),
                raw_file=(record.get("raw_file") or "").strip(),
                notes=(record.get("notes") or "").strip(),
            ))
    return rows


def _safe_dt(value):
    try:
        return parse_dt(value)
    except ValueError:
        return None


def _load_raw_text(case_dir: Path, row: DataManifestRow) -> tuple[str, str | None]:
    """Return (text, raw_file_path). Falls back to manifest notes if no file."""
    if row.raw_file:
        raw_path = Path(case_dir) / "raw_sources" / row.raw_file
        if raw_path.is_file():
            return raw_path.read_text(encoding="utf-8"), str(raw_path)
        return "", str(raw_path)  # missing file -> caught by validation (empty text)
    return row.notes, None


def ingest_case(case_dir: Path) -> IngestionReport:
    """Run the full Phase 1 ingestion for one case directory."""
    case_dir = Path(case_dir)
    config = load_case_config(case_dir)
    cutoff = config.forecast_cutoff
    rows = read_manifest(case_dir)

    included: list[EvidenceItem] = []
    excluded: list[EvidenceItem] = []
    exclusion_reasons: dict[str, str] = {}
    issues: list[ValidationIssue] = []

    for index, row in enumerate(rows, start=1):
        text, raw_file_path = _load_raw_text(case_dir, row)
        item = EvidenceItem(
            evidence_id=f"ev-{index:04d}",
            case_id=config.case_id,
            title=row.title,
            source_type=row.source_type,
            source_name=row.publisher,
            source_url_or_ref=row.url_or_location,
            event_time=row.event_time,
            knowledge_time=row.knowledge_time,
            ingested_at=utc_now(),
            text=text,
            raw_file_path=raw_file_path,
            notes=row.notes,
        )

        # Exclusion rules, in priority order. The manifest's own exclusion
        # comes first so a manually excluded retrospective keeps its
        # human-recorded reason even if it also violates the cutoff.
        reason: str | None = None
        if row.status == "excluded":
            reason = row.exclusion_reason or "excluded in manifest (no reason recorded)"
            if not row.exclusion_reason:
                issues.append(ValidationIssue(
                    severity="warning",
                    code="manifest_exclusion_without_reason",
                    message=f"{row.source_id}: excluded in manifest without a reason",
                    source_id=row.source_id,
                ))
        elif row.knowledge_time is None:
            reason = "knowledge_time missing or unparseable — boundary cannot be verified"
        elif row.knowledge_time > cutoff:
            reason = (
                f"knowledge_time {row.knowledge_time.isoformat()} is after "
                f"forecast cutoff {cutoff.isoformat()}"
            )

        if reason is not None:
            item.included_in_forecast = False
            item.exclusion_reason = reason
            exclusion_reasons[row.source_id] = reason
            excluded.append(item)
        else:
            included.append(item)

    # Validate the included packet only; excluded items already carry reasons.
    issues.extend(validate_evidence(included, cutoff))

    write_evidence(case_dir, included)
    write_excluded_evidence(case_dir, excluded)

    report = IngestionReport(
        case_id=config.case_id,
        total_sources=len(rows),
        included_count=len(included),
        excluded_count=len(excluded),
        exclusion_reasons=exclusion_reasons,
        validation_issues=issues,
        cutoff_date=cutoff,
        generated_at=utc_now(),
    )
    (case_dir / REPORT_FILE).write_text(
        json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return report


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python ingestion.py <case_dir>")
        sys.exit(2)
    result = ingest_case(Path(sys.argv[1]))
    print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
