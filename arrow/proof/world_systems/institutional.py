"""Institutional system: reads formal rules and mechanisms.

Theory: institutions cut both ways. Activated formal mechanisms (letters,
confidence votes, committee procedures) create a path that makes the event
MORE likely; the same rules also impose thresholds that can make it HARDER.
A constraint signal on its own therefore says little about direction — it
becomes readable only alongside factional pressure showing the mechanism is
actually being used against the target.

v0 rule: institutional signal is 'mixed' unless faction pressure is also
present (> 0.25), in which case the mechanism is treated as activated.
"""

from __future__ import annotations

from world_state_schema import WorldState
from world_systems.base import WorldSystemResult, standard_result

CLAIM_TYPES = {"institutional_constraint"}
FACTION_ACTIVATION_THRESHOLD = 0.25


class InstitutionalSystem:
    name = "institutional"
    version = "0.1.0"

    def assess(self, state: WorldState) -> WorldSystemResult:
        score = state.world_system_inputs.institutional
        faction = state.world_system_inputs.faction

        # Direction override per the v0 rule above; standard_result still
        # handles the no-claims / near-zero cases itself.
        if faction > FACTION_ACTIVATION_THRESHOLD:
            direction = "event_more_likely" if score >= 0.6 else "mixed"
            activation = (
                f"faction pressure ({faction:.3f}) exceeds the activation threshold, "
                "so the formal mechanism is read as being used against the target"
            )
        else:
            direction = "mixed"
            activation = (
                f"faction pressure ({faction:.3f}) is at or below the activation "
                "threshold, so constraints alone do not imply the event is likelier — "
                "rules can enable or block"
            )

        return standard_result(
            self.name, self.version, state, score, CLAIM_TYPES,
            reasoning=(
                f"Institutional reading for {state.target_actor}: constraint claims "
                f"aggregate to {score:.3f}; {activation}."
            ),
            direction=direction,
            extra_limitations=[
                "Institutional signals are direction-ambiguous by nature; the v0 "
                "faction-activation rule is a crude proxy for mechanism activation."
            ],
        )
