#Candidate entry / withdrawal / endorsement (spec section 4.4).



from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from .config import DistrictData
from .state import ElectionState


@dataclass
class EntryCoordinationModel:


    transfer_matrix: Dict[str, Dict[str, float]] = field(default_factory=dict)

    def _remove_candidate(self, district: DistrictData, cand: str) -> None:
        if district.candidates_present and cand in district.candidates_present:
            district.candidates_present = [
                c for c in district.candidates_present if c != cand
            ]
        for b in district.blocs:
            b.utility.pop(cand, None)

    def withdraw(self, state: ElectionState, cand: str) -> ElectionState:
        """Candidate stands down everywhere; support follows next preference."""
        s = state.copy()
        for d in s.districts:
            self._remove_candidate(d, cand)
        return s

    def endorse(
        self, state: ElectionState, cand: str, endorsee: str, base_transfer: float = 0.6
    ) -> ElectionState:
  
        s = state.copy()
        rate = self.transfer_matrix.get(cand, {}).get(endorsee, base_transfer)
        rate = float(min(max(rate, 0.0), 1.0))
        for d in s.districts:
            for b in d.blocs:
                if cand not in b.utility:
                    continue
                # Among followers, lift the endorsee well above the bloc's other
                # remaining options so the next-preference re-sort favours them.
                if endorsee in b.utility:
                    others = [u for c, u in b.utility.items() if c not in (cand, endorsee)]
                    top_other = max(others) if others else b.utility[endorsee]
                    boost = rate * (abs(top_other) + 1.0)
                    b.utility[endorsee] = max(b.utility[endorsee], top_other) + boost
            self._remove_candidate(d, cand)
        return s

    # ----- explicit stay-vs-exit utilities (reporting; spec 4.4) --------- #
    @staticmethod
    def eu_stay(
        p_win: float, office_benefit: float, policy_utility_if_stay: float, run_cost: float
    ) -> float:
        return p_win * office_benefit + policy_utility_if_stay - run_cost

    @staticmethod
    def eu_exit_to(
        policy_utility_if_endorse: float,
        bargain_value: float,
        reputational_cost: float,
    ) -> float:
        return policy_utility_if_endorse + bargain_value - reputational_cost
