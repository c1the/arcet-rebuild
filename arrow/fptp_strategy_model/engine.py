# Top level orchestration thing a mob

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

from .actions import Action
from .campaign import CampaignResponseModel
from .config import DistrictData, ElectionConfig
from .decision import Decision, DecisionEngine, Optimizer
from .entry import EntryCoordinationModel
from .explainer import Decomposition, Explainer
from .mechanical import MechanicalSeatModel
from .payoff import ObjectiveWeights, PayoffFunction, RiskConfig
from .preferences import VoteModel
from .simulate import Simulator
from .state import StateSampler
from .strategic import StrategicParams, StrategicVotingModel


@dataclass
class StrategyModel:

    config: ElectionConfig
    districts: List[DistrictData]
    vote_model: VoteModel = field(default_factory=VoteModel)
    strategic_params: StrategicParams = field(default_factory=StrategicParams)
    campaign: CampaignResponseModel = field(default_factory=CampaignResponseModel)
    coordination: EntryCoordinationModel = field(default_factory=EntryCoordinationModel)
    sampler_kwargs: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.mech = MechanicalSeatModel()
        self.payoff = PayoffFunction(self.config.governing_threshold)

    def _build_simulator(self, seed: int, strat_params: StrategicParams | None = None,
                         coordination: EntryCoordinationModel | None = None,
                         **sampler_overrides) -> Simulator:
        kwargs = dict(self.sampler_kwargs)
        kwargs.update(sampler_overrides)
        sampler = StateSampler(
            base_districts=self.districts, config=self.config, seed=seed, **kwargs
        )
        strat = StrategicVotingModel(self.vote_model, strat_params or self.strategic_params)
        return Simulator(
            sampler=sampler,
            vote_model=self.vote_model,
            strategic_model=strat,
            mechanical_model=self.mech,
            campaign=self.campaign,
            coordination=coordination or self.coordination,
            candidates=list(self.config.candidate_ids),
        )

    def recommend(
        self,
        actions: List[Action],
        actor: str,
        weights: ObjectiveWeights,
        *,
        risk: RiskConfig | None = None,
        kappa: float = 0.0,
        n_simulations: int = 1000,
        seed: int = 0,
    ) -> Dict:
       
        engine = DecisionEngine(kappa=kappa, allowed_types=set(self.config.allowed_action_types))
        feasible = engine.feasible(actions, actor)
        sim = self._build_simulator(seed)
        opt = Optimizer(sim, self.payoff, actor, weights, risk or RiskConfig())
        ranked = opt.rank(feasible, n_simulations)
        decision = engine.decide(ranked, weights)

        # Decomposition for the recommended (or top) action.
        chosen = decision.recommended or (ranked[0] if ranked else None)
        decomposition = None
        if chosen is not None:
            sq = Action(type="status_quo", actor=actor, label="status_quo")
            explainer = Explainer(sim, self.mech, list(self.config.candidate_ids))
            decomposition = explainer.decompose(chosen.action, actor, sq)

        sensitivity = self.sensitivity(
            feasible, actor, weights, risk or RiskConfig(), kappa, n_simulations, seed
        )
        return {
            "decision": decision,
            "decomposition": decomposition,
            "sensitivity": sensitivity,
            "feasible_actions": feasible,
            "weights": weights,
        }

    # Sensitivity to the assumptions that most often flip results
    def sensitivity(
        self,
        actions: List[Action],
        actor: str,
        weights: ObjectiveWeights,
        risk: RiskConfig,
        kappa: float,
        n_simulations: int,
        seed: int,
    ) -> List[Dict]:
      
        engine = DecisionEngine(kappa=kappa, allowed_types=set(self.config.allowed_action_types))

        def top_under(sim) -> Dict:
            opt = Optimizer(sim, self.payoff, actor, weights, risk)
            ranked = opt.rank(actions, max(200, n_simulations // 2))
            dec = engine.decide(ranked, weights)
            top = dec.recommended or (ranked[0] if ranked else None)
            return {
                "top": top.action.label if top else None,
                "clear_best": dec.clear_best,
                "gap": dec.payoff_gap,
            }

        scenarios: List[Dict] = []

        # Baseline.
        scenarios.append({"scenario": "baseline", **top_under(self._build_simulator(seed))})

        # Higher polling error.
        scenarios.append({
            "scenario": "polling_error_high",
            **top_under(self._build_simulator(seed, national_swing_sd=
                self.sampler_kwargs.get("national_swing_sd", 0.15) * 2.0,
                perceived_sigma=self.sampler_kwargs.get("perceived_sigma", 0.05) * 2.0)),
        })

        # Lower tactical-voting propensity (voters stickier).
        low_tac = copy.deepcopy(self.strategic_params)
        low_tac.g1 = low_tac.g1 * 0.5
        low_tac.g0 = low_tac.g0 - 1.0
        scenarios.append({
            "scenario": "tactical_propensity_low",
            **top_under(self._build_simulator(seed, strat_params=low_tac)),
        })

        # Higher tactical-voting propensity.
        high_tac = copy.deepcopy(self.strategic_params)
        high_tac.g1 = high_tac.g1 * 1.5
        high_tac.g0 = high_tac.g0 + 1.0
        scenarios.append({
            "scenario": "tactical_propensity_high",
            **top_under(self._build_simulator(seed, strat_params=high_tac)),
        })

        # Weaker endorsement transfers (relevant when withdraw/endorse is on the table).
        weak_coord = EntryCoordinationModel(
            transfer_matrix={
                frm: {to: rate * 0.5 for to, rate in d.items()}
                for frm, d in self.coordination.transfer_matrix.items()
            }
        )
        scenarios.append({
            "scenario": "transfer_rate_low",
            **top_under(self._build_simulator(seed, coordination=weak_coord)),
        })

        return scenarios
