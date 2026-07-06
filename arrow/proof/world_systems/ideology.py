"""Ideology system: reads principled/programmatic conflict.

Theory: ideological splits harden opposition — actors in a values conflict
are less open to compromise than actors in a power conflict. Signal:
ideological_conflict claims aggregated into world_system_inputs.ideology.
"""

from __future__ import annotations

from world_state_schema import WorldState
from world_systems.base import WorldSystemResult, standard_result

CLAIM_TYPES = {"ideological_conflict"}


class IdeologySystem:
    name = "ideology"
    version = "0.1.0"

    def assess(self, state: WorldState) -> WorldSystemResult:
        score = state.world_system_inputs.ideology
        return standard_result(
            self.name, self.version, state, score, CLAIM_TYPES,
            reasoning=(
                f"Ideological reading for {state.target_actor}: ideological-conflict "
                f"claims aggregate to {score:.3f}. Higher values mean the dispute is "
                "framed in principles and red lines, which hardens positions and "
                "narrows the space for a negotiated retreat."
            ),
        )
