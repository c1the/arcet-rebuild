#Campaign response with diminishing returns 

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CampaignResponseModel:
    alpha: float = 0.20            # persuasion elasticity (utility per log-unit effort)
    opponent_response: float = 0.0  # assumed reactive dampening
    mobilise_elasticity: float = 0.15  # turnout response for mobilisation actions

    def persuasion_effect(self, effort: float) -> float:
        import math

        effort = max(0.0, float(effort))
        return self.alpha * math.log1p(effort) - self.opponent_response

    def mobilisation_multiplier(self, effort: float) -> float:
        import math

        effort = max(0.0, float(effort))
        return 1.0 + self.mobilise_elasticity * math.log1p(effort)
