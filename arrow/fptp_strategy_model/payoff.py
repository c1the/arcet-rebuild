#Payoff function

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import numpy as np

from .actions import Action


@dataclass
class ObjectiveWeights:

    w_win: float = 0.0       # win a specific target seat
    w_seats: float = 0.0     # expected total seats
    w_majority: float = 0.0  # probability of reaching the governing threshold
    w_policy: float = 0.0    # policy utility of the winners
    w_vote: float = 0.0      # own national vote share
    target_seat: Optional[str] = None
    policy_utility: Dict[str, float] = field(default_factory=dict)  # winner -> utility to actor


@dataclass
class Outcome:
 

    winners: List[str]                  # winner per district (ordered like districts)
    district_ids: List[str]
    seats: Dict[str, int]
    national_vote_share: Dict[str, float]


@dataclass
class RiskConfig:


    lambda_risk: float = 0.0
    metric: str = "std"   # one of: std, var, cvar, lcb_gap
    alpha: float = 0.10   # tail level for cvar / lower-confidence bound


class PayoffFunction:
    def __init__(self, governing_threshold: int = 0):
        self.governing_threshold = governing_threshold

    #single-draw utility 
    def utility(
        self, outcome: Outcome, action: Action, actor: str, weights: ObjectiveWeights
    ) -> float:
        u = 0.0
        if weights.w_win and weights.target_seat is not None:
            try:
                idx = outcome.district_ids.index(weights.target_seat)
                u += weights.w_win * (1.0 if outcome.winners[idx] == actor else 0.0)
            except ValueError:
                pass
        s_party = outcome.seats.get(actor, 0)
        u += weights.w_seats * s_party
        if weights.w_majority and self.governing_threshold > 0:
            u += weights.w_majority * (1.0 if s_party >= self.governing_threshold else 0.0)
        if weights.w_policy and weights.policy_utility:
            pol = np.mean(
                [weights.policy_utility.get(w, 0.0) for w in outcome.winners]
            )
            u += weights.w_policy * float(pol)
        u += weights.w_vote * outcome.national_vote_share.get(actor, 0.0)

        u -= action.action_cost
        u -= action.reputational_cost
        u += float(action.params.get("bargain_value", 0.0))
        return float(u)

    #aggregation over draws
    @staticmethod
    def risk(samples: np.ndarray, cfg: RiskConfig) -> float:
        if cfg.metric == "var":
            return float(np.var(samples))
        if cfg.metric == "std":
            return float(np.std(samples))
        if cfg.metric == "cvar":
            q = np.quantile(samples, cfg.alpha)
            tail = samples[samples <= q]
            shortfall = float(np.mean(samples) - (tail.mean() if tail.size else q))
            return max(shortfall, 0.0)
        if cfg.metric == "lcb_gap":
            return float(np.mean(samples) - np.quantile(samples, cfg.alpha))
        raise ValueError(f"Unknown risk metric: {cfg.metric}")

    def score(self, samples: Sequence[float], cfg: RiskConfig) -> Dict[str, float]:

        s = np.asarray(samples, dtype=float)
        mean = float(s.mean())
        j = mean - cfg.lambda_risk * self.risk(s, cfg)
        return {
            "J": j,
            "mean_utility": mean,
            "std_utility": float(s.std()),
            "lcb": float(np.quantile(s, cfg.alpha)),   # lower-confidence bound
            "ucb": float(np.quantile(s, 1 - cfg.alpha)),
        }
