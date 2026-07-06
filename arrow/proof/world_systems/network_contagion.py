"""Network contagion system: reads social diffusion of defection.

Theory: defection spreads through relationship networks — visible breaks and
realignments lower the cost for the next defector. Signals: network_signal,
relationship_break, relationship_support claims aggregated into
world_system_inputs.network_contagion.
"""

from __future__ import annotations

from world_state_schema import WorldState
from world_systems.base import WorldSystemResult, standard_result

CLAIM_TYPES = {"network_signal", "relationship_break", "relationship_support"}


class NetworkContagionSystem:
    name = "network_contagion"
    version = "0.1.0"

    def assess(self, state: WorldState) -> WorldSystemResult:
        score = state.world_system_inputs.network_contagion
        return standard_result(
            self.name, self.version, state, score, CLAIM_TYPES,
            reasoning=(
                f"Network-contagion reading for {state.target_actor}: network, "
                f"relationship-break and relationship-support claims aggregate to "
                f"{score:.3f}. Higher values indicate defection cascading through "
                "the actor's relationship network; support claims counteract."
            ),
        )
