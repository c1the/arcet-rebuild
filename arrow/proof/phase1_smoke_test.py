"""Phase 1 smoke test: run ingestion on cases/demo_case_001 and verify it.

The demo case ships three fictional sources:

  src-0001  pre-cutoff news            -> must be INCLUDED
  src-0002  post-cutoff news           -> must be EXCLUDED (cutoff rule)
  src-0003  retrospective biography    -> must be EXCLUDED (manifest exclusion)

Run from arrow/proof:  python phase1_smoke_test.py
Exits 0 on success, 1 on any failed assertion.
"""

from __future__ import annotations

import sys
from pathlib import Path

from evidence_store import read_evidence, read_excluded_evidence
from ingestion import ingest_case

CASE_DIR = Path(__file__).parent / "cases" / "demo_case_001"


def main() -> int:
    print(f"Ingesting demo case: {CASE_DIR}")
    report = ingest_case(CASE_DIR)

    included = read_evidence(CASE_DIR)
    excluded = read_excluded_evidence(CASE_DIR)
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, condition))
        print(f"  [{'PASS' if condition else 'FAIL'}] {name}")

    check("report counts 3 total sources", report.total_sources == 3)
    check("exactly 1 item in evidence.jsonl", len(included) == 1)
    check("the included item is the pre-cutoff Herald article",
          len(included) == 1
          and "Backbenchers circulate letter" in included[0].title
          and included[0].included_in_forecast)
    check("included item's knowledge_time is before the cutoff",
          len(included) == 1 and included[0].knowledge_time < report.cutoff_date)

    check("2 items in excluded_evidence.jsonl", len(excluded) == 2)
    check("report records included_count=1 and excluded_count=2",
          report.included_count == 1 and report.excluded_count == 2)

    check("post-cutoff source excluded with a cutoff reason",
          "after" in report.exclusion_reasons.get("src-0002", "").lower()
          and "cutoff" in report.exclusion_reasons.get("src-0002", "").lower())
    check("retrospective source excluded with the manifest's own reason",
          "retrospective" in report.exclusion_reasons.get("src-0003", "").lower())

    check("no validation errors on the included packet",
          not [i for i in report.validation_issues if i.severity == "error"])

    failed = [name for name, ok in checks if not ok]
    print()
    if failed:
        print(f"SMOKE TEST FAILED — {len(failed)} of {len(checks)} checks failed:")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"SMOKE TEST PASSED — all {len(checks)} checks passed.")
    print(f"Report written to {CASE_DIR / 'ingestion_report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
