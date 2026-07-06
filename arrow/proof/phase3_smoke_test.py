"""Phase 3 smoke test: world-state building on cases/demo_case_001.

Ensures Phase 1 and Phase 2 outputs exist (running them if needed), builds
the world state, and verifies consistency, bounds, and validation.

Run from arrow/proof:  python phase3_smoke_test.py
Exits 0 on success, 1 on any failed assertion.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from claim_extractor import extract_case
from claim_store import read_claims
from ingestion import ingest_case
from world_state_builder import build_world_state

CASE_DIR = Path(__file__).parent / "cases" / "demo_case_001"
WORLD_SYSTEM_FIELDS = [
    "incentive", "faction", "ideology",
    "network_contagion", "institutional", "media_pressure",
]


def main() -> int:
    if not (CASE_DIR / "evidence.jsonl").is_file():
        print("evidence.jsonl missing — running Phase 1 ingestion first")
        ingest_case(CASE_DIR)
    if not (CASE_DIR / "extracted_claims.jsonl").is_file():
        print("extracted_claims.jsonl missing — running Phase 2 extraction first")
        extract_case(CASE_DIR)

    print(f"Building world state for: {CASE_DIR}")
    state, report = build_world_state(CASE_DIR)

    claims = read_claims(CASE_DIR)
    inputs = state.world_system_inputs.to_dict()
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, condition))
        print(f"  [{'PASS' if condition else 'FAIL'}] {name}")

    check("world_state.json exists", (CASE_DIR / "world_state.json").is_file())
    check("claim_count equals extracted claims count",
          state.claim_count == len(claims))
    check("at least one claim_type_signal exists",
          len(state.claim_type_signals) >= 1)
    check("world_system_inputs contains all six fields",
          sorted(inputs.keys()) == sorted(WORLD_SYSTEM_FIELDS))
    check("all world_system_inputs are between 0 and 1",
          all(0.0 <= inputs[f] <= 1.0 for f in WORLD_SYSTEM_FIELDS))

    errors = [i for i in report.validation_issues if i.severity == "error"]
    check("no validation errors", not errors)
    for e in errors:
        print(f"      validation error: {e.message}")

    print()
    print(f"  evidence count: {state.evidence_count}")
    print(f"  claim count:    {state.claim_count}")
    print(f"  actor count:    {len(state.actors)}")
    print(f"  world system inputs:")
    for name in WORLD_SYSTEM_FIELDS:
        print(f"    {name}: {inputs[name]}")

    failed = [name for name, ok in checks if not ok]
    print()
    if failed:
        print(f"SMOKE TEST FAILED — {len(failed)} of {len(checks)} checks failed:")
        for name in failed:
            print(f"  - {name}")
        return 1
    print(f"SMOKE TEST PASSED — all {len(checks)} checks passed.")
    print(f"Report written to {CASE_DIR / 'world_state_report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
