#Explainer: causal, decomposed account of why an action scores as it does


from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from .actions import Action
from .mechanical import MechanicalSeatModel
from .simulate import Simulator


@dataclass
class Decomposition:
    actor: str
    baseline_sincere_seats: Dict[str, int]
    mechanical_only_seats: Dict[str, int]
    strategic_seats: Dict[str, int]
    action_seats: Dict[str, int]
    strategic_effect_on_actor: int
    action_effect_on_actor: int
    notes: List[str]


class Explainer:
    def __init__(self, simulator: Simulator, mech: MechanicalSeatModel, candidates: List[str]):
        self.sim = simulator
        self.mech = mech
        self.candidates = candidates

    def decompose(self, action: Action, actor: str, status_quo: Action) -> Decomposition:
        base_state = self.sim.sampler.expected_state()

        # Status-quo sincere (no strategic).
        sincere_sq, _, _ = self.sim._district_outcome(base_state, use_strategic=False)
        sincere_seats = self.mech.seat_counts(sincere_sq, self.candidates)

        # Status-quo strategic.
        _, strat_sq, _ = self.sim._district_outcome(base_state, use_strategic=True)
        strat_seats = self.mech.seat_counts(strat_sq, self.candidates)

        # Action: full pipeline on mean state.
        res = self.sim.run_action(action, n_simulations=1, use_strategic=True)
        action_seats = self.mech.seat_counts(res.strategic_shares, self.candidates)

        strat_effect = strat_seats.get(actor, 0) - sincere_seats.get(actor, 0)
        action_effect = action_seats.get(actor, 0) - strat_seats.get(actor, 0)

        notes = [
            f"Strategic (psychological) effect on {actor}: {strat_effect:+d} seat(s) "
            f"vs sincere voting.",
            f"Action '{action.label}' effect on {actor}: {action_effect:+d} seat(s) "
            f"vs strategic status quo.",
            "mechanical_only equals baseline_sincere because FPTP conversion is "
            "applied to the same votes; the column isolates the vote->seat step.",
        ]
        return Decomposition(
            actor=actor,
            baseline_sincere_seats=sincere_seats,
            mechanical_only_seats=sincere_seats,
            strategic_seats=strat_seats,
            action_seats=action_seats,
            strategic_effect_on_actor=strat_effect,
            action_effect_on_actor=action_effect,
            notes=notes,
        )
