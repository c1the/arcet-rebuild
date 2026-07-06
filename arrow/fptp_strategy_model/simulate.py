#Core simulation loop (spec section 6 pseudocode).



from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

from .actions import Action, apply_action_effects
from .campaign import CampaignResponseModel
from .entry import EntryCoordinationModel
from .mechanical import MechanicalSeatModel
from .payoff import Outcome
from .preferences import VoteModel
from .state import ElectionState, StateSampler
from .strategic import StrategicVotingModel


@dataclass
class SimResult:
    outcomes: List[Outcome]
    n_nonconverged: int
    # diagnostic share tables for the *expected* (mean) state under this action
    sincere_shares: List[Dict[str, float]]
    strategic_shares: List[Dict[str, float]]


class Simulator:
    def __init__(
        self,
        sampler: StateSampler,
        vote_model: VoteModel,
        strategic_model: StrategicVotingModel,
        mechanical_model: MechanicalSeatModel,
        campaign: CampaignResponseModel,
        coordination: EntryCoordinationModel,
        candidates: List[str],
    ):
        self.sampler = sampler
        self.vote = vote_model
        self.strategic = strategic_model
        self.mech = mechanical_model
        self.campaign = campaign
        self.coordination = coordination
        self.candidates = candidates

    # ----- one state -> district shares --------------------------------- #
    def _district_outcome(
        self, state: ElectionState, use_strategic: bool
    ) -> Tuple[List[Dict[str, float]], List[Dict[str, float]], int]:
        sincere_list, strat_list = [], []
        nonconv = 0
        for d in state.districts:
            sincere = self.vote.sincere_shares(d)
            sincere_list.append(sincere)
            if use_strategic:
                strat, _wp, _viable, conv = self.strategic.run(
                    d, state.share_sigma.get(d.district_id, 0.05)
                )
                if not conv:
                    nonconv += 1
                strat_list.append(strat)
            else:
                strat_list.append(sincere)
        return sincere_list, strat_list, nonconv

    def _to_outcome(
        self, state: ElectionState, district_shares: List[Dict[str, float]]
    ) -> Outcome:
        winners = self.mech.winners(district_shares)
        seats = self.mech.seat_counts(district_shares, self.candidates)
        natl = self.mech.national_vote_share(district_shares, self.candidates)
        return Outcome(
            winners=winners,
            district_ids=[d.district_id for d in state.districts],
            seats=seats,
            national_vote_share=natl,
        )

    # ----- full Monte Carlo for an action ------------------------------- #
    def run_action(
        self, action: Action, n_simulations: int, use_strategic: bool = True
    ) -> SimResult:
        outcomes: List[Outcome] = []
        nonconv_total = 0
        for _ in range(n_simulations):
            state = self.sampler.draw()
            state = apply_action_effects(state, action, self.campaign, self.coordination)
            _sincere, strat, nc = self._district_outcome(state, use_strategic)
            nonconv_total += nc
            outcomes.append(self._to_outcome(state, strat))

        # Diagnostic shares on the mean (noise-free) state.
        mean_state = self.sampler.expected_state()
        mean_state = apply_action_effects(
            mean_state, action, self.campaign, self.coordination
        )
        sincere_mean, strat_mean, _ = self._district_outcome(mean_state, use_strategic)
        return SimResult(
            outcomes=outcomes,
            n_nonconverged=nonconv_total,
            sincere_shares=sincere_mean,
            strategic_shares=strat_mean,
        )
