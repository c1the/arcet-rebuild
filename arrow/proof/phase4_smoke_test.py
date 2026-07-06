"""Phase 4 smoke test: world systems on cases/demo_case_001.

Ensures Phase 1-3 outputs exist (running them if needed), runs all six world
systems, and verifies counts, bounds, reasoning, and validation.

Run from arrow/proof:  python phase4_smoke_test.py
Exits 0 on success, 1 on any failed assertion.
"""

from __future__ import annotations

import sys
from pathlib import Path

from claim_extractor import extract_case
from ingestion import ingest_case
from world_state_builder import build_world_state
from world_state_store import read_world_state
from world_system_runner import run_world_systems

CASE_DIR = Path(__file__).parent / "cases" / "demo_case_001"
EXPECTED_SYSTEMS = {
    "incentive", "faction", "ideology",
    "network_contagion", "institutional", "media_pressure",
}


def main() -> int:
    if not (CASE_DIR / "evidence.jsonl").is_file():
        print("evidence.jsonl missing — running Phase 1 ingestion first")
        ingest_case(CASE_DIR)
    if not (CASE_DIR / "extracted_claims.jsonl").is_file():
        print("extracted_claims.jsonl missing — running Phase 2 extraction first")
        extract_case(CASE_DIR)
    if read_world_state(CASE_DIR) is None:
        print("world_state.json missing or placeholder — running Phase 3 builder first")
        build_world_state(CASE_DIR)

    print(f"Running world systems for: {CASE_DIR}")
    results, report = run_world_systems(CASE_DIR)
    by_name = {r.system_name: r for r in results}

    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, condition))
        print(f"  [{'PASS' if condition else 'FAIL'}] {name}")

    check("world_system_results.json exists",
          (CASE_DIR / "world_system_results.json").is_file())
    check("exactly six systems ran",
          len(results) == 6 and set(by_name) == EXPECTED_SYSTEMS)
    check("all scores are in [0,1]",
          all(0.0 <= r.score <= 1.0 for r in results))
    check("all confidences are in [0,1]",
          all(0.0 <= r.confidence <= 1.0 for r in results))
    check("no result has empty reasoning_summary",
          all(r.reasoning_summary.strip() for r in results))
    check("demo case produces nonzero faction system score",
          by_name["faction"].score > 0)
    check("demo case produces nonzero institutional system score",
          by_name["institutional"].score > 0)

    errors = [i for i in report["validation_issues"] if i["severity"] == "error"]
    check("validation passes (no errors)", not errors)
    for e in errors:
        print(f"      validation error: {e['message']}")

    print()
    print(f"  systems run: {', '.join(report['systems_run'])}")
    print(f"  score / direction by system:")
    for r in results:
        print(f"    {r.system_name:<18} score={r.score:<6} direction={r.direction}")
    print(f"  high_signal_systems: {report['high_signal_systems'] or '(none)'}")

    failed = [name for name, ok in checks if not ok]
    print()
    if failed:
        print(f"SMOKE TEST FAILED — {len(failed)} of {len(checks)} checks failed:")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"SMOKE TEST PASSED — all {len(checks)} checks passed.")
    print(f"Report written to {CASE_DIR / 'world_system_report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
