"""Media pressure system: reads public salience.

Theory: sustained public salience — hostile coverage, scandal, open dissent —
shrinks a leader's room to wait out a crisis and emboldens challengers.
Signals: media_pressure, scandal_pressure, public_dissent claims aggregated
into world_system_inputs.media_pressure.
"""

from __future__ import annotations

from world_state_schema import WorldState
from world_systems.base import WorldSystemResult, standard_result

CLAIM_TYPES = {"media_pressure", "scandal_pressure", "public_dissent"}


class MediaPressureSystem:
    name = "media_pressure"
    version = "0.1.0"

    def assess(self, state: WorldState) -> WorldSystemResult:
        score = state.world_system_inputs.media_pressure
        return standard_result(
            self.name, self.version, state, score, CLAIM_TYPES,
            reasoning=(
                f"Public-salience reading for {state.target_actor}: media, scandal "
                f"and public-dissent claims aggregate to {score:.3f}. Higher values "
                "mean the crisis stays on the front pages, raising the cost of "
                "inaction for the target's colleagues."
            ),
        )
