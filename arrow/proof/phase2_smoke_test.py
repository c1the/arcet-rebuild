"""Phase 2 smoke test: claim extraction on cases/demo_case_001.

Ensures Phase 1 output exists (runs ingestion if not), extracts claims, and
verifies that claims come only from included evidence and all validate.

Run from arrow/proof:  python phase2_smoke_test.py
Exits 0 on success, 1 on any failed assertion.
"""

from __future__ import annotations

import sys
from pathlib import Path

from case_store import load_case_config
from claim_extractor import extract_case
from claim_store import read_claims
from claim_validation import validate_claims
from evidence_store import read_evidence, read_excluded_evidence
from ingestion import ingest_case

CASE_DIR = Path(__file__).parent / "cases" / "demo_case_001"


def main() -> int:
    # Phase 1 output must exist first; run ingestion if it doesn't.
    if not (CASE_DIR / "evidence.jsonl").is_file():
        print("evidence.jsonl missing — running Phase 1 ingestion first")
        ingest_case(CASE_DIR)

    print(f"Extracting claims for: {CASE_DIR}")
    report = extract_case(CASE_DIR)

    config = load_case_config(CASE_DIR)
    included_ids = {e.evidence_id for e in read_evidence(CASE_DIR)}
    excluded_ids = {e.evidence_id for e in read_excluded_evidence(CASE_DIR)}
    claims = read_claims(CASE_DIR)

    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, condition))
        print(f"  [{'PASS' if condition else 'FAIL'}] {name}")

    check("extracted_claims.jsonl exists", (CASE_DIR / "extracted_claims.jsonl").is_file())
    check("at least one claim generated from included evidence",
          len(claims) >= 1 and any(c.evidence_id in included_ids for c in claims))
    check("no claims generated from excluded evidence",
          not any(c.evidence_id in excluded_ids for c in claims))
    check("every claim traces to an included evidence item",
          all(c.evidence_id in included_ids for c in claims))

    issues = validate_claims(claims, config.forecast_cutoff, known_evidence_ids=included_ids)
    errors = [i for i in issues if i.severity == "error"]
    check("all claims validate (no errors)", not errors)
    for e in errors:
        print(f"      validation error: {e.message}")

    check("report counts match file contents",
          report.claims_generated == len(claims)
          and report.evidence_items_read == len(included_ids))

    print()
    print(f"  evidence read:    {report.evidence_items_read}")
    print(f"  claims generated: {report.claims_generated}")
    print(f"  claims by type:")
    for claim_type, count in sorted(report.claims_by_type.items()):
        print(f"    {claim_type}: {count}")

    failed = [name for name, ok in checks if not ok]
    print()
    if failed:
        print(f"SMOKE TEST FAILED — {len(failed)} of {len(checks)} checks failed:")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"SMOKE TEST PASSED — all {len(checks)} checks passed.")
    print(f"Report written to {CASE_DIR / 'claim_extraction_report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
