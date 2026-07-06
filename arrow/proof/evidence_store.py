"""Read/write evidence for an Arrow Proof case directory.

Included evidence lives in ``evidence.jsonl``; excluded evidence is kept
separately in ``excluded_evidence.jsonl`` so the forecast stage can load the
included file alone with no filtering logic.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from schemas import EvidenceItem

EVIDENCE_FILE = "evidence.jsonl"
EXCLUDED_FILE = "excluded_evidence.jsonl"


def _read_jsonl(path: Path) -> list[EvidenceItem]:
    if not path.is_file():
        return []
    items: list[EvidenceItem] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        if "_comment" in record:  # template example lines are not evidence
            continue
        items.append(EvidenceItem.from_dict(record))
    return items


def _write_jsonl(path: Path, items: Iterable[EvidenceItem]) -> None:
    lines = [json.dumps(item.to_dict(), ensure_ascii=False) for item in items]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def read_evidence(case_dir: Path) -> list[EvidenceItem]:
    """Load included evidence from evidence.jsonl (empty list if absent)."""
    return _read_jsonl(Path(case_dir) / EVIDENCE_FILE)


def write_evidence(case_dir: Path, items: Iterable[EvidenceItem]) -> None:
    """Overwrite evidence.jsonl with the given items."""
    _write_jsonl(Path(case_dir) / EVIDENCE_FILE, items)


def append_evidence(case_dir: Path, item: EvidenceItem) -> None:
    """Append one evidence item to evidence.jsonl."""
    path = Path(case_dir) / EVIDENCE_FILE
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(item.to_dict(), ensure_ascii=False) + "\n")


def read_excluded_evidence(case_dir: Path) -> list[EvidenceItem]:
    """Load excluded evidence from excluded_evidence.jsonl (empty if absent)."""
    return _read_jsonl(Path(case_dir) / EXCLUDED_FILE)


def write_excluded_evidence(case_dir: Path, items: Iterable[EvidenceItem]) -> None:
    """Overwrite excluded_evidence.jsonl with the given items."""
    _write_jsonl(Path(case_dir) / EXCLUDED_FILE, items)
