"""Read/write world_state.json for an Arrow Proof case directory."""

from __future__ import annotations

import json
from pathlib import Path

from world_state_schema import WorldState

WORLD_STATE_FILE = "world_state.json"


def read_world_state(case_dir: Path) -> WorldState | None:
    """Load world_state.json, or None if absent / still a template placeholder."""
    path = Path(case_dir) / WORLD_STATE_FILE
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if "_comment" in data or "generated_at" not in data:
        return None  # Phase 0 placeholder, not a built world state
    return WorldState.from_dict(data)


def write_world_state(case_dir: Path, state: WorldState) -> None:
    """Write world_state.json with stable, diff-friendly formatting."""
    path = Path(case_dir) / WORLD_STATE_FILE
    path.write_text(
        json.dumps(state.to_dict(), indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )
