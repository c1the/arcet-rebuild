#Electoral state and the Monte Carlo draw of states from data

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

from .config import DistrictData, ElectionConfig


@dataclass
class ElectionState:

    districts: List[DistrictData]
    config: ElectionConfig
    # Per-district uncertainty (sigma on candidate shares) used by the
    # strategic-voting viability test within this draw.
    share_sigma: Dict[str, float] = field(default_factory=dict)

    def copy(self) -> "ElectionState":
        return ElectionState(
            districts=copy.deepcopy(self.districts),
            config=self.config,  # static, safe to share
            share_sigma=dict(self.share_sigma),
        )


@dataclass
class StateSampler:
    base_districts: List[DistrictData]
    config: ElectionConfig
    national_swing_sd: float = 0.15
    local_swing_sd: float = 0.10
    region_swing_sd: float = 0.05
    perceived_sigma: float = 0.05
    seed: int = 0

    def __post_init__(self) -> None:
        self._rng = np.random.default_rng(self.seed)
        self._candidates = list(self.config.candidate_ids)
        self._regions = sorted(
            {d.region for d in self.base_districts if d.region is not None}
        )

    def draw(self) -> ElectionState:
        cands = self._candidates
        # Shared national candidate-level swing (utility shift), correlated
        # across all districts.
        national = {c: self._rng.normal(0.0, self.national_swing_sd) for c in cands}
        regional = {
            r: {c: self._rng.normal(0.0, self.region_swing_sd) for c in cands}
            for r in self._regions
        }

        new_districts: List[DistrictData] = []
        share_sigma: Dict[str, float] = {}
        for d in self.base_districts:
            d2 = copy.deepcopy(d)
            local = {c: self._rng.normal(0.0, self.local_swing_sd) for c in cands}
            reg = regional.get(d.region, {c: 0.0 for c in cands})
            for b in d2.blocs:
                for c in list(b.utility):
                    b.utility[c] = (
                        b.utility[c] + national.get(c, 0.0) + reg.get(c, 0.0) + local.get(c, 0.0)
                    )
            new_districts.append(d2)
            share_sigma[d.district_id] = self.perceived_sigma

        return ElectionState(
            districts=new_districts, config=self.config, share_sigma=share_sigma
        )

    def expected_state(self) -> ElectionState:
        new_districts = [copy.deepcopy(d) for d in self.base_districts]
        share_sigma = {d.district_id: self.perceived_sigma for d in self.base_districts}
        return ElectionState(
            districts=new_districts, config=self.config, share_sigma=share_sigma
        )
