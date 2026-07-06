"""Incentive system: reads electoral cost/benefit pressure.

Theory: actors move against a leader when the electoral cost of keeping them
exceeds the cost of removing them. Signals: electoral_pressure and
polling_decline claims, already aggregated into world_system_inputs.incentive.
"""

from __future__ import annotations

from world_state_schema import WorldState
from world_systems.base import WorldSystemResult, standard_result

CLAIM_TYPES = {"electoral_pressure", "polling_decline"}


class IncentiveSystem:
    name = "incentive"
    version = "0.1.0"

    def assess(self, state: WorldState) -> WorldSystemResult:
        score = state.world_system_inputs.incentive
        return standard_result(
            self.name, self.version, state, score, CLAIM_TYPES,
            reasoning=(
                f"Incentive reading for {state.target_actor}: electoral-pressure and "
                f"polling-decline signals aggregate to {score:.3f}. Higher values mean "
                "colleagues face growing electoral cost in keeping the incumbent, "
                "raising the incentive to act."
            ),
        )
