"""
ons_loader.py — Load constituency-level demographic features from ONS CSV.

Expected file: ons_qualifications.csv (Census 2021 TS067, Westminster Parliamentary
Constituencies, downloaded from nomisweb.co.uk)

Columns expected:
  'Westminster Parliamentary constituencies Code'
  'Highest level of qualification (8 categories)'
  'Observation'

Public API:
    load_ons_features(csv_path) → Dict[ons_code, Dict[str, float]]
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict

import pandas as pd

logger = logging.getLogger(__name__)

_CODE_COL = "Westminster Parliamentary constituencies Code"
_CAT_COL  = "Highest level of qualification (8 categories)"
_OBS_COL  = "Observation"


def load_ons_features(csv_path: str) -> Dict[str, Dict[str, float]]:
    """
    Returns dict keyed by ONS code, e.g.:
      {"E14000530": {"pct_level4_plus": 0.30, "pct_no_quals": 0.18}, ...}

    Returns empty dict on any failure — blocs.py falls back to national defaults.
    """
    path = Path(csv_path)
    if not path.exists():
        logger.error("ONS CSV not found: %s", csv_path)
        return {}

    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        logger.error("Failed to read %s: %s", csv_path, e)
        return {}

    # Verify expected columns present
    for col in (_CODE_COL, _CAT_COL, _OBS_COL):
        if col not in df.columns:
            logger.error("Expected column not found: %r. Columns: %s", col, list(df.columns))
            return {}

    # Total valid population per constituency (exclude "Does not apply")
    valid = df[df[_CAT_COL] != "Does not apply"]
    tots  = valid.groupby(_CODE_COL)[_OBS_COL].sum()

    # Level 4+
    l4 = (
        df[df[_CAT_COL].str.startswith("Level 4")]
        .set_index(_CODE_COL)[_OBS_COL]
    )

    # No qualifications
    nq = (
        df[df[_CAT_COL] == "No qualifications"]
        .set_index(_CODE_COL)[_OBS_COL]
    )

    pct_l4 = (l4 / tots).dropna()
    pct_nq = (nq / tots).dropna()

    out: Dict[str, Dict[str, float]] = {}
    for code in tots.index:
        features: Dict[str, float] = {}
        if code in pct_l4:
            features["pct_level4_plus"] = float(pct_l4[code])
        if code in pct_nq:
            features["pct_no_quals"] = float(pct_nq[code])
        if features:
            out[str(code)] = features

    logger.info("Loaded ONS features for %d constituencies", len(out))
    return out
