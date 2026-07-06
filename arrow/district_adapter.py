"""
district_adapter.py — Public data → DistrictData adapter

Reads HoC-GE2024-results-by-constituency.xlsx and produces DistrictInfo
objects (ONS code, name, region, electorate, turnout, vote_shares).

Separate from the bloc constructor: DistrictInfo + Blocs → DistrictData
is done by compose_district_data() once the bloc pipeline is wired in.

Usage:
    from district_adapter import load_hoc_results, compose_district_data, stub_district_data

    registry = load_hoc_results("HoC-GE2024-results-by-constituency.xlsx")

    # Look up by ONS code or fuzzy name
    info = registry["E14000762"]
    info = registry.find("Bristol Central")

    # Compose with real blocs (bloc constructor output)
    district = compose_district_data(info, blocs)

    # Or compose with vote-share-derived stub blocs (until bloc constructor ready)
    district = stub_district_data(info, actor="Lab")
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import openpyxl

# ── Data structure ────────────────────────────────────────────────────────────

@dataclass
class DistrictInfo:
    """Public data for one UK constituency from HoC GE2024."""
    ons_code:    str                   # e.g. E14000762
    name:        str                   # e.g. "Bristol Central"
    region:      str                   # e.g. "South West"
    country:     str                   # e.g. "England"
    electorate:  int
    valid_votes: int
    turnout:     float                 # valid_votes / electorate
    vote_shares: Dict[str, float]      # party → share of valid votes (0–1)
    vote_counts: Dict[str, int]        # party → raw vote total
    winner:      str                   # winning party abbreviation

    @property
    def majority(self) -> int:
        """Winning margin in votes."""
        sorted_counts = sorted(self.vote_counts.values(), reverse=True)
        if len(sorted_counts) < 2:
            return sorted_counts[0] if sorted_counts else 0
        return sorted_counts[0] - sorted_counts[1]

    @property
    def majority_pct(self) -> float:
        return self.majority / self.valid_votes if self.valid_votes else 0.0

    @property
    def is_marginal(self) -> bool:
        return self.majority_pct < 0.10


# ── Registry (dict + name lookup) ─────────────────────────────────────────────

class DistrictRegistry(dict):
    """dict[ons_code → DistrictInfo] with name-based lookup."""

    def find(self, query: str) -> Optional[DistrictInfo]:
        """Find by ONS code (exact) or constituency name (case-insensitive, partial)."""
        # Exact ONS code
        if query in self:
            return self[query]
        # Normalised name match
        q = _normalise(query)
        for info in self.values():
            if q in _normalise(info.name):
                return info
        return None

    def find_many(self, queries: List[str]) -> List[DistrictInfo]:
        """Resolve a list of ONS codes or names; silently drops misses."""
        results = []
        for q in queries:
            hit = self.find(q)
            if hit:
                results.append(hit)
        return results

    def marginals(self, threshold: float = 0.10) -> List[DistrictInfo]:
        """All constituencies with majority % below threshold."""
        return [d for d in self.values() if d.majority_pct < threshold]


def _normalise(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower().strip())


# ── Column detection ──────────────────────────────────────────────────────────

# Known column name patterns in HoC GE2024 xlsx (case-insensitive, partial match)
_COL_PATTERNS = {
    "ons_code":    ["ons id", "ons_id", "gss code", "constituency code"],
    "name":        ["constituency name", "name"],
    "country":     ["country name", "country"],
    "region":      ["region name", "region"],
    "electorate":  ["electorate"],
    "valid_votes": ["valid votes", "valid_votes", "total votes cast"],
    "first_party": ["first party", "winning party", "winner"],
}

# Known UK party abbreviations in HoC results files
_KNOWN_PARTIES = {
    "lab", "con", "ld", "snp", "pc", "green", "ruk", "reform",
    "ukip", "brexit", "ind", "sdlp", "alliance", "uup", "dup",
    "sf", "tuv", "workers", "spk", "alba",
}


def _match_col(header: str, patterns: List[str]) -> bool:
    h = header.lower().strip()
    return any(p in h for p in patterns)


def _detect_party_col(header: str) -> Optional[str]:
    """Return normalised party key if this column looks like a party vote total."""
    h = header.lower().strip()
    # Strip common suffixes
    for suffix in [" votes", " vote", " total"]:
        if h.endswith(suffix):
            h = h[:-len(suffix)].strip()
    if h in _KNOWN_PARTIES:
        return h
    # Short 2-4 char tokens that look like party abbreviations
    if re.match(r"^[a-z]{2,6}$", h) and len(h) <= 6:
        return h
    return None


# ── Parser ────────────────────────────────────────────────────────────────────

def load_hoc_results(path: str | Path) -> DistrictRegistry:
    """
    Load HoC GE2024 results xlsx → DistrictRegistry.

    Raises FileNotFoundError if path doesn't exist.
    Raises ValueError if required columns can't be found.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"HoC results file not found: {path}")

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

    # Pick the right sheet (first sheet that has an electorate column)
    ws = _find_results_sheet(wb)

    # Read headers from first non-empty row
    headers, header_row_idx = _find_headers(ws)
    col_map, party_cols = _map_columns(headers)

    _validate_required(col_map)

    registry = DistrictRegistry()

    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        if all(v is None for v in row):
            continue

        def get(key):
            idx = col_map.get(key)
            return row[idx] if idx is not None else None

        ons_code = str(get("ons_code") or "").strip()
        name     = str(get("name") or "").strip()
        if not ons_code or not name:
            continue

        country     = str(get("country") or "").strip()
        region      = str(get("region") or "").strip()
        electorate  = _to_int(get("electorate"))
        valid_votes = _to_int(get("valid_votes"))

        if not electorate or not valid_votes:
            continue

        turnout = valid_votes / electorate

        # Party vote counts
        vote_counts: Dict[str, int] = {}
        for party, col_idx in party_cols.items():
            v = _to_int(row[col_idx])
            if v and v > 0:
                vote_counts[party] = v

        vote_shares = {
            p: v / valid_votes for p, v in vote_counts.items()
        }

        # Determine winner
        first_party = str(get("first_party") or "").strip().lower()
        if not first_party and vote_counts:
            first_party = max(vote_counts, key=vote_counts.get)

        registry[ons_code] = DistrictInfo(
            ons_code=ons_code,
            name=name,
            region=region,
            country=country,
            electorate=electorate,
            valid_votes=valid_votes,
            turnout=turnout,
            vote_shares=vote_shares,
            vote_counts=vote_counts,
            winner=first_party,
        )

    wb.close()

    if not registry:
        raise ValueError("No constituency rows parsed — check sheet/column structure")

    return registry


def _find_results_sheet(wb: openpyxl.Workbook):
    """Return the sheet most likely to contain constituency results."""
    for name in wb.sheetnames:
        ws = wb[name]
        # Quick scan: does any cell in first 5 rows look like an electorate header?
        for row in ws.iter_rows(min_row=1, max_row=5, values_only=True):
            for cell in row:
                if cell and "electorate" in str(cell).lower():
                    return ws
    # Fallback: first sheet
    return wb[wb.sheetnames[0]]


def _find_headers(ws) -> tuple[list, int]:
    """Return (list of header strings, 1-based row index)."""
    for idx, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True), start=1):
        cells = [str(c).strip() if c is not None else "" for c in row]
        # A valid header row has at least 5 non-empty cells
        if sum(1 for c in cells if c) >= 5:
            return cells, idx
    raise ValueError("Could not find header row in sheet")


def _map_columns(headers: list) -> tuple[dict, dict]:
    """Return (col_map, party_cols) where values are 0-based column indices."""
    col_map: Dict[str, int] = {}
    party_cols: Dict[str, int] = {}

    for i, h in enumerate(headers):
        if not h:
            continue
        # Try required columns
        for key, patterns in _COL_PATTERNS.items():
            if key not in col_map and _match_col(h, patterns):
                col_map[key] = i
                break
        else:
            # Try party vote column
            party = _detect_party_col(h)
            if party and party not in party_cols:
                # Skip if already claimed by a required column
                if i not in col_map.values():
                    party_cols[party] = i

    return col_map, party_cols


def _validate_required(col_map: dict) -> None:
    required = ["ons_code", "name", "electorate", "valid_votes"]
    missing = [k for k in required if k not in col_map]
    if missing:
        raise ValueError(
            f"Required columns not found: {missing}. "
            "Check that the xlsx sheet has headers like 'ONS ID', 'Constituency name', "
            "'Electorate', 'Valid votes'."
        )


def _to_int(v) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ── Compose: DistrictInfo + Blocs → DistrictData ─────────────────────────────

def compose_district_data(info: DistrictInfo, blocs: list):
    """
    Combine a DistrictInfo (public data) with a list of Bloc objects
    (from the bloc constructor) into a DistrictData ready for the pipeline.

    Import DistrictData here rather than at module top to avoid circular
    dependencies if this file lives inside fptp_strategy_model.
    """
    from fptp_strategy_model import DistrictData
    return DistrictData(
        district_id=info.ons_code,
        electorate=info.electorate,
        turnout=info.turnout,
        blocs=blocs,
    )


def stub_district_data(info: DistrictInfo, actor: str):
    """
    Build a DistrictData with rough vote-share-derived stub blocs.
    Replacement point: swap out once real bloc constructor is ready.

    Maps GE2024 vote shares to 3 blocs (actor-lean, swing, opposition-lean)
    scaled to the actual constituency result. Better than fixed profiles
    but still a stub — NOT calibrated bloc regression output.
    """
    from fptp_strategy_model import Bloc, DistrictData

    actor_key = actor.lower()
    shares = info.vote_shares

    # Actor's share and combined opposition
    actor_share = shares.get(actor_key, 0.0)
    opp_shares  = {p: s for p, s in shares.items() if p != actor_key}
    total_opp   = sum(opp_shares.values())

    # Largest opponent
    opp_a_key   = max(opp_shares, key=opp_shares.get) if opp_shares else "opp_a"
    opp_a_share = opp_shares.get(opp_a_key, 0.0)
    opp_b_share = total_opp - opp_a_share

    opp_a = opp_a_key.upper()
    opp_b = "OPP_B"

    # Three blocs: actor-leaning, swing (centre), opp-leaning
    # Sizes are rough proxies from vote shares; real bloc sizes come from regression
    actor_bloc_size = max(actor_share, 0.05)
    opp_bloc_size   = max(opp_a_share, 0.05)
    swing_size      = max(1.0 - actor_bloc_size - opp_bloc_size - opp_b_share, 0.05)
    # Normalise
    total = actor_bloc_size + opp_bloc_size + swing_size + opp_b_share
    actor_bloc_size /= total
    opp_bloc_size   /= total
    swing_size      /= total
    opp_b_size       = opp_b_share / total

    blocs = [
        Bloc(
            size=actor_bloc_size,
            utility={actor: 7, opp_a: 1, opp_b: 0},
            expressive_cost=0.4,
            info_level=0.8,
        ),
        Bloc(
            size=swing_size,
            utility={actor: 3, opp_a: 4, opp_b: 2},
            expressive_cost=0.3,
            info_level=0.9,
        ),
        Bloc(
            size=opp_bloc_size,
            utility={actor: 1, opp_a: 7, opp_b: 2},
            expressive_cost=0.4,
            info_level=0.8,
        ),
    ]
    if opp_b_size > 0.02:
        blocs.append(
            Bloc(
                size=opp_b_size,
                utility={actor: 0, opp_a: 3, opp_b: 7},
                expressive_cost=0.5,
                info_level=0.7,
            )
        )

    return DistrictData(
        district_id=info.ons_code,
        electorate=info.electorate,
        turnout=info.turnout,
        blocs=blocs,
    )
