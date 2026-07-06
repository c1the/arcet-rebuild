"""Read/write extracted_claims.jsonl for an Arrow Proof case directory."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from claim_schema import ExtractedClaim

CLAIMS_FILE = "extracted_claims.jsonl"

# Records carrying these keys are template/example rows, not real claims.
_SKIP_MARKERS = ("_comment", "example_for_deletion")


def read_claims(case_dir: Path) -> list[ExtractedClaim]:
    """Load claims from extracted_claims.jsonl (empty list if absent)."""
    path = Path(case_dir) / CLAIMS_FILE
    if not path.is_file():
        return []
    claims: list[ExtractedClaim] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        if any(marker in record for marker in _SKIP_MARKERS):
            continue
        claims.append(ExtractedClaim.from_dict(record))
    return claims


def write_claims(case_dir: Path, claims: Iterable[ExtractedClaim]) -> None:
    """Overwrite extracted_claims.jsonl — one stable JSON object per line."""
    lines = [json.dumps(c.to_dict(), ensure_ascii=False) for c in claims]
    path = Path(case_dir) / CLAIMS_FILE
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def append_claim(case_dir: Path, claim: ExtractedClaim) -> None:
    """Append one claim to extracted_claims.jsonl."""
    path = Path(case_dir) / CLAIMS_FILE
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(claim.to_dict(), ensure_ascii=False) + "\n")
