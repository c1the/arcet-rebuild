"""Phase 4 runner: world_state.json -> world_system_results.json.

Runs all six world systems over a case's world state, validates the results,
and writes world_system_results.json + world_system_report.json. These are
partial theory outputs for the future aggregator — not the Arrow forecast.

Usage:  python world_system_runner.py <case_dir>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from case_store import load_case_config
from schemas import iso, utc_now
from world_state_schema import WorldState
from world_state_store import read_world_state
from world_systems import ALL_SYSTEMS
from world_systems.base import (
    DIRECTIONS,
    WorldSystemResult,
    WorldSystemValidationIssue,
)

RESULTS_FILE = "world_system_results.json"
REPORT_FILE = "world_system_report.json"

# A system counts as high-signal when it read a usable signal at all.
HIGH_SIGNAL_THRESHOLD = 0.25


def validate_results(
    results: list[WorldSystemResult], state: WorldState
) -> list[WorldSystemValidationIssue]:
    """Validate all system results against the world state they were built from."""
    issues: list[WorldSystemValidationIssue] = []

    def issue(severity: str, code: str, message: str, system: str, field: str | None = None):
        issues.append(WorldSystemValidationIssue(
            severity=severity, code=code, message=message,
            system_name=system, field_name=field,
        ))

    # Claim ids a system may legitimately cite: anything the world state
    # itself exposes via claim_type_signals or top_claims.
    allowed_ids: set[str] = set()
    for signal in state.claim_type_signals:
        allowed_ids.update(signal.supporting_claim_ids)
    allowed_ids.update(
        entry["claim_id"] for entry in state.top_claims if "claim_id" in entry
    )

    for result in results:
        name = result.system_name
        if not 0.0 <= result.score <= 1.0:
            issue("error", "score_out_of_range",
                  f"{name}: score {result.score} outside [0, 1]", name, "score")
        if not 0.0 <= result.confidence <= 1.0:
            issue("error", "confidence_out_of_range",
                  f"{name}: confidence {result.confidence} outside [0, 1]",
                  name, "confidence")
        if result.direction not in DIRECTIONS:
            issue("error", "unknown_direction",
                  f"{name}: unknown direction {result.direction!r}", name, "direction")
        if not (result.reasoning_summary or "").strip():
            issue("error", "empty_reasoning_summary",
                  f"{name}: reasoning_summary is empty", name, "reasoning_summary")
        for cid in result.supporting_claim_ids:
            if cid not in allowed_ids:
                issue("error", "unknown_supporting_claim_id",
                      f"{name}: cites claim_id {cid!r} not present in the world state",
                      name, "supporting_claim_ids")
        if state.claim_count == 0 and result.direction != "insufficient_signal":
            issue("error", "signal_from_empty_claim_set",
                  f"{name}: world state has zero claims but direction is "
                  f"{result.direction!r}, not insufficient_signal", name, "direction")
    return issues


def run_world_systems(case_dir: Path) -> tuple[list[WorldSystemResult], dict]:
    """Run all systems for one case; write results and report; return both."""
    case_dir = Path(case_dir)
    config = load_case_config(case_dir)
    state = read_world_state(case_dir)
    if state is None:
        raise FileNotFoundError(
            f"No built world_state.json in {case_dir} — run world_state_builder.py first"
        )

    results = [system().assess(state) for system in ALL_SYSTEMS]
    issues = validate_results(results, state)
    generated_at = utc_now()

    results_doc = {
        "case_id": config.case_id,
        "generated_at": iso(generated_at),
        "systems_run": [r.system_name for r in results],
        "results": [r.to_dict() for r in results],
    }
    (case_dir / RESULTS_FILE).write_text(
        json.dumps(results_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    report_doc = {
        "case_id": config.case_id,
        "generated_at": iso(generated_at),
        "systems_run": [r.system_name for r in results],
        "high_signal_systems": [
            r.system_name for r in results
            if r.score >= HIGH_SIGNAL_THRESHOLD and r.direction != "insufficient_signal"
        ],
        "low_signal_systems": [
            r.system_name for r in results
            if r.score < HIGH_SIGNAL_THRESHOLD or r.direction == "insufficient_signal"
        ],
        "validation_issues": [i.to_dict() for i in issues],
        "notes": "Partial theory outputs for the future aggregator; heuristic, "
                 "uncalibrated, and not a forecast.",
    }
    (case_dir / REPORT_FILE).write_text(
        json.dumps(report_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return results, report_doc


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python world_system_runner.py <case_dir>")
        sys.exit(2)
    _, report = run_world_systems(Path(sys.argv[1]))
    print(json.dumps(report, indent=2, ensure_ascii=False))
