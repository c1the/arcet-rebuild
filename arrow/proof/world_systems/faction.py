"""Faction system: reads organised internal opposition.

Theory: leaders fall when internal opposition becomes organised — factions
align, elites signal defection, opposition goes public. Signals:
faction_alignment, elite_signal, leadership_opposition claims aggregated
into world_system_inputs.faction.
"""

from __future__ import annotations

from world_state_schema import WorldState
from world_systems.base import WorldSystemResult, standard_result

CLAIM_TYPES = {"faction_alignment", "elite_signal", "leadership_opposition"}


class FactionSystem:
    name = "faction"
    version = "0.1.0"

    def assess(self, state: WorldState) -> WorldSystemResult:
        score = state.world_system_inputs.faction
        return standard_result(
            self.name, self.version, state, score, CLAIM_TYPES,
            reasoning=(
                f"Factional reading for {state.target_actor}: faction-alignment, "
                f"elite-signal and leadership-opposition claims aggregate to {score:.3f}. "
                "Higher values indicate organised internal opposition rather than "
                "isolated grumbling."
            ),
        )
