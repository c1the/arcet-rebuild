#The lawful, aggregate action space and how each action
#modifies an election state.



from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

import numpy as np

from .campaign import CampaignResponseModel
from .config import ALLOWED_ACTION_TYPES
from .entry import EntryCoordinationModel
from .state import ElectionState


@dataclass
class Action:


    type: str
    actor: str
    params: Dict[str, Any] = field(default_factory=dict)
    label: str = ""
    reputational_cost: float = 0.0
    action_cost: float = 0.0

    def __post_init__(self) -> None:
        if self.type not in ALLOWED_ACTION_TYPES:
            raise ValueError(f"Action type '{self.type}' is not in the allowed set.")
        if not self.label:
            self.label = f"{self.type}:{self.actor}"


def apply_action_effects(
    state: ElectionState,
    action: Action,
    campaign: CampaignResponseModel,
    coordination: EntryCoordinationModel,
) -> ElectionState:
 
    t = action.type
    if t == "status_quo":
        return state.copy()

    if t == "allocate":
        s = state.copy()
        effort = action.params.get("effort", {})
        for d in s.districts:
            e = effort.get(d.district_id, 0.0)
            if e <= 0:
                continue
            bump = campaign.persuasion_effect(e)
            for b in d.blocs:
                if action.actor in b.utility:
                    b.utility[action.actor] += bump
        return s

    if t == "mobilise":
        s = state.copy()
        effort = action.params.get("effort", {})
        for d in s.districts:
            e = effort.get(d.district_id, 0.0)
            if e <= 0:
                continue
            mult = campaign.mobilisation_multiplier(e)
            for b in d.blocs:
                fav = max(b.utility, key=b.utility.get)
                if fav == action.actor:
                    b.size *= mult
            tot = sum(b.size for b in d.blocs)
            for b in d.blocs:
                b.size /= tot
        return s

    if t == "reposition":
        s = state.copy()
        gain = float(action.params.get("gain", 0.0))
        base_cost = float(action.params.get("base_cost", 0.0))
        districts = action.params.get("districts")
        for d in s.districts:
            if districts is not None and d.district_id not in districts:
                continue
            for b in d.blocs:
                if action.actor not in b.utility:
                    continue
                fav = max(b.utility, key=b.utility.get)
                if fav == action.actor:
                    b.utility[action.actor] -= base_cost   # alienate the base
                else:
                    b.utility[action.actor] += gain         # court persuadables
        return s

    if t == "withdraw":
        return coordination.withdraw(state, action.actor)

    if t == "endorse":
        endorsee = action.params["endorsee"]
        base_transfer = float(action.params.get("base_transfer", 0.6))
        return coordination.endorse(state, action.actor, endorsee, base_transfer)

    if t == "release_info":
        s = state.copy()
        factor = float(action.params.get("sigma_factor", 0.5))
        for k in s.share_sigma:
            s.share_sigma[k] *= factor
        return s

    raise ValueError(f"Unhandled action type: {t}")  # pragma: no cover
