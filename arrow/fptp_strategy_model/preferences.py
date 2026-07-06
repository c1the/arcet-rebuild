#Preference and sincere-vote models


from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Sequence

import numpy as np

from .config import Bloc, DistrictData


class VoteModel:


    def __init__(self, tau: float = 0.35):
        if tau <= 0:
            raise ValueError("tau must be > 0 (use a small value for near-deterministic).")
        self.tau = tau

    def bloc_choice_probs(self, bloc: Bloc, candidates: Sequence[str]) -> np.ndarray:
        u = np.array([bloc.utility.get(c, -1e9) for c in candidates], dtype=float)
        # Numerically stable softmax.
        z = (u - u.max()) / self.tau
        ez = np.exp(z)
        return ez / ez.sum()

    def sincere_shares(self, district: DistrictData) -> Dict[str, float]:

        cands = list(district.candidates_present)
        agg = np.zeros(len(cands))
        for b in district.blocs:
            agg += b.size * self.bloc_choice_probs(b, cands)
        total = agg.sum()
        if total > 0:
            agg = agg / total
        return {c: float(s) for c, s in zip(cands, agg)}


@dataclass
class PreferenceModel:


    candidate_positions: Dict[str, np.ndarray]  # candidate -> issue-space point
    valence: Dict[str, float]                    # candidate -> valence
    beta: float = 1.0                            # proximity weight

    def bloc_from_segment(
        self,
        ideal_point: Sequence[float],
        size: float,
        *,
        incumbent: str | None = None,
        incumbency_bonus: float = 0.0,
        expressive_cost: float = 0.5,
        info_level: float = 1.0,
        label: str | None = None,
    ) -> Bloc:
        x = np.asarray(ideal_point, dtype=float)
        utility: Dict[str, float] = {}
        for c, p in self.candidate_positions.items():
            prox = -self.beta * float(np.sum((x - np.asarray(p, float)) ** 2))
            util = prox + self.valence.get(c, 0.0)
            if incumbent is not None and c == incumbent:
                util += incumbency_bonus
            utility[c] = util
        return Bloc(
            size=size,
            utility=utility,
            expressive_cost=expressive_cost,
            info_level=info_level,
            label=label,
        )
