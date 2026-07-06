"""
blocs.py — Bloc constructor for Arrow.

Builds Bloc objects from GE2024 vote shares + ONS demographic features.

Public API:
    build_blocs(vote_shares, candidates, party_map, ons_features) → List[Bloc]
    infer_party_map(actor_id, actor_party, vote_shares) → (candidates, party_map)
    normalise_party(key) → PROXIMITY key (e.g. "lab" → "Lab", "ruk" → "Reform")
"""

from __future__ import annotations
from typing import Dict, List, Optional
from fptp_strategy_model import Bloc


# ── Party key normalisation ───────────────────────────────────────────────────
# HoC data stores parties as lowercase abbreviations; PROXIMITY uses title-case.

PARTY_KEY_MAP: Dict[str, str] = {
    "lab": "Lab", "con": "Con", "ld": "LD",
    "green": "Green", "ruk": "Reform", "reform": "Reform",
    "snp": "SNP", "pc": "PC",
    # Everything else → Other
}

def normalise_party(key: str) -> str:
    return PARTY_KEY_MAP.get(key.lower().strip(), "Other")


# ── Ideological proximity matrix ──────────────────────────────────────────────
# PROXIMITY[voter_party][candidate_party] = utility (0–5).
# Magnitudes matter: drives sincere preference strength + tactical switching.

PROXIMITY: Dict[str, Dict[str, float]] = {
    "Lab":    {"Lab": 5.0, "Con": 0.5, "LD": 3.0, "Green": 3.5, "Reform": 0.0, "SNP": 3.5, "PC": 3.5, "Other": 2.0},
    "Con":    {"Lab": 0.5, "Con": 5.0, "LD": 2.0, "Green": 0.5, "Reform": 2.5, "SNP": 0.5, "PC": 0.5, "Other": 1.5},
    "LD":     {"Lab": 3.0, "Con": 2.0, "LD": 5.0, "Green": 3.5, "Reform": 0.0, "SNP": 2.5, "PC": 2.5, "Other": 2.0},
    "Green":  {"Lab": 3.5, "Con": 0.5, "LD": 3.0, "Green": 5.0, "Reform": 0.0, "SNP": 3.5, "PC": 3.5, "Other": 2.0},
    "Reform": {"Lab": 0.5, "Con": 2.5, "LD": 0.5, "Green": 0.0, "Reform": 5.0, "SNP": 0.3, "PC": 0.3, "Other": 1.5},
    "SNP":    {"Lab": 3.0, "Con": 0.5, "LD": 2.5, "Green": 3.5, "Reform": 0.0, "SNP": 5.0, "PC": 4.0, "Other": 2.0},
    "PC":     {"Lab": 3.0, "Con": 0.5, "LD": 2.5, "Green": 3.5, "Reform": 0.0, "SNP": 4.0, "PC": 5.0, "Other": 2.0},
    "Other":  {"Lab": 2.5, "Con": 2.5, "LD": 2.5, "Green": 2.5, "Reform": 2.5, "SNP": 2.5, "PC": 2.5, "Other": 3.0},
}

NATIONAL_DEFAULTS: Dict[str, float] = {
    "pct_level4_plus": 0.334,
    "pct_no_quals":    0.174,
}

_INFO_MIN, _INFO_MAX = 0.50, 1.00
_COST_MIN, _COST_MAX = 0.20, 0.80


def _info_level(pct_level4_plus: float) -> float:
    return float(max(_INFO_MIN, min(_INFO_MAX, 0.50 + pct_level4_plus * (0.50 / 0.60))))

def _expressive_cost(pct_no_quals: float) -> float:
    return float(max(_COST_MIN, min(_COST_MAX, 0.20 + pct_no_quals * (0.60 / 0.60))))


def build_blocs(
    vote_shares: Dict[str, float],    # HoC lowercase party keys → share
    candidates: List[str],            # sim candidate IDs
    party_map: Dict[str, str],        # candidate_id → PROXIMITY key
    ons_features: Optional[Dict[str, float]] = None,
    min_share: float = 0.02,
) -> List[Bloc]:
    """
    One Bloc per significant party. Sizes are vote shares (fraction of valid
    votes = fraction of turnout). DistrictData auto-renormalises.
    """
    feats = {**NATIONAL_DEFAULTS, **(ons_features or {})}
    info  = _info_level(feats["pct_level4_plus"])
    cost  = _expressive_cost(feats["pct_no_quals"])

    significant = {p: s for p, s in vote_shares.items() if s >= min_share}
    if not significant:
        raise ValueError(f"No party exceeds min_share={min_share}. vote_shares={vote_shares}")

    blocs: List[Bloc] = []
    for party_raw, share in significant.items():
        voter_party = normalise_party(party_raw)
        row = PROXIMITY.get(voter_party, PROXIMITY["Other"])
        utility = {cand: row.get(party_map.get(cand, "Other"), 2.5) for cand in candidates}
        bloc_info = info * (0.85 if share < 0.10 else 1.0)
        blocs.append(Bloc(
            size=share,
            utility=utility,
            expressive_cost=cost,
            info_level=float(max(_INFO_MIN, min(_INFO_MAX, bloc_info))),
        ))

    return blocs


def infer_party_map(
    actor_id: str,
    actor_party: str,                 # PROXIMITY key e.g. "Lab"
    vote_shares: Dict[str, float],    # HoC lowercase keys
    n_opponents: int = 2,
) -> tuple[List[str], Dict[str, str]]:
    """
    Returns (candidates, party_map) where:
      candidates = [actor_id, top_opp1, top_opp2, ...]  (real party names as IDs)
      party_map  = {candidate_id: PROXIMITY_key}
    """
    actor_raw = actor_party.lower()
    others = sorted(
        ((p, s) for p, s in vote_shares.items() if p != actor_raw),
        key=lambda x: x[1],
        reverse=True,
    )
    top_opponents = [p for p, _ in others[:n_opponents]]

    candidates = [actor_id] + top_opponents
    party_map  = {actor_id: actor_party}
    party_map.update({p: normalise_party(p) for p in top_opponents})

    return candidates, party_map
