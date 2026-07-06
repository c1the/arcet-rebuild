#Optimizer + DecisionEngine

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

from .actions import Action
from .config import ALLOWED_ACTION_TYPES
from .payoff import ObjectiveWeights, PayoffFunction, RiskConfig
from .simulate import Simulator


@dataclass
class ActionScore:
    action: Action
    J: float
    mean_utility: float
    std_utility: float
    lcb: float
    ucb: float
    p_win_target: float
    expected_seats: float
    p_majority: float
    n_nonconverged: int
    utility_samples: np.ndarray = field(repr=False, default=None)


@dataclass
class Decision:
    recommended: ActionScore | None
    runner_up: ActionScore | None
    payoff_gap: float
    kappa: float
    clear_best: bool
    ranked: List[ActionScore]
    weights: ObjectiveWeights
    message: str


class Optimizer:
    def __init__(
        self,
        simulator: Simulator,
        payoff: PayoffFunction,
        actor: str,
        weights: ObjectiveWeights,
        risk: RiskConfig | None = None,
    ):
        self.sim = simulator
        self.payoff = payoff
        self.actor = actor
        self.weights = weights
        self.risk = risk or RiskConfig()

    def score_action(self, action: Action, n_simulations: int) -> ActionScore:
        res = self.sim.run_action(action, n_simulations)
        us = np.array(
            [self.payoff.utility(o, action, self.actor, self.weights) for o in res.outcomes]
        )
        sc = self.payoff.score(us, self.risk)

        # Supporting probabilities.
        seats = np.array([o.seats.get(self.actor, 0) for o in res.outcomes])
        if self.weights.target_seat is not None:
            wins = []
            for o in res.outcomes:
                try:
                    i = o.district_ids.index(self.weights.target_seat)
                    wins.append(1.0 if o.winners[i] == self.actor else 0.0)
                except ValueError:
                    wins.append(0.0)
            p_win = float(np.mean(wins))
        else:
            p_win = float("nan")
        thr = self.payoff.governing_threshold
        p_maj = float(np.mean(seats >= thr)) if thr > 0 else float("nan")

        return ActionScore(
            action=action,
            J=sc["J"],
            mean_utility=sc["mean_utility"],
            std_utility=sc["std_utility"],
            lcb=sc["lcb"],
            ucb=sc["ucb"],
            p_win_target=p_win,
            expected_seats=float(seats.mean()),
            p_majority=p_maj,
            n_nonconverged=res.n_nonconverged,
            utility_samples=us,
        )

    def rank(self, actions: List[Action], n_simulations: int) -> List[ActionScore]:
        scores = [self.score_action(a, n_simulations) for a in actions]
        scores.sort(key=lambda s: s.J, reverse=True)
        return scores


class DecisionEngine:

    def __init__(self, kappa: float = 0.0, allowed_types: set | None = None):
        self.kappa = kappa
        self.allowed_types = allowed_types or set(ALLOWED_ACTION_TYPES)

    def feasible(self, actions: List[Action], actor: str) -> List[Action]:
        ok = []
        for a in actions:
            if a.type not in self.allowed_types:
                continue  # not lawful/permitted in this configuration
            if a.actor != actor:
                continue  # only the actor's own actions
            ok.append(a)
        return ok

    def decide(self, ranked: List[ActionScore], weights: ObjectiveWeights) -> Decision:
        if not ranked:
            return Decision(None, None, 0.0, self.kappa, False, [], weights,
                            "No feasible actions to evaluate.")
        top = ranked[0]
        runner = ranked[1] if len(ranked) > 1 else None
        gap = (top.J - runner.J) if runner else float("inf")
        clear = gap >= self.kappa
        if clear:
            msg = (
                f"Recommended action: '{top.action.label}' "
                f"(J={top.J:.4f}); leads runner-up by {gap:.4f} >= kappa={self.kappa:.4f}."
            )
        else:
            msg = (
                f"No clear best action. Top two ('{top.action.label}' vs "
                f"'{runner.action.label if runner else 'n/a'}') differ by only "
                f"{gap:.4f} < kappa={self.kappa:.4f}. Gather more information "
                f"(reduce polling/transfer uncertainty) before committing."
            )
        return Decision(
            recommended=top if clear else None,
            runner_up=runner,
            payoff_gap=float(gap),
            kappa=self.kappa,
            clear_best=clear,
            ranked=ranked,
            weights=weights,
            message=msg,
        )
