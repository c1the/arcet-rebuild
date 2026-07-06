"""Arrow Proof world systems: one theory-specific assessment per module.

Each system consumes world_state.json and returns a WorldSystemResult.
These are partial theory outputs for the future aggregator — heuristic
assessments, not calibrated probabilities and not the Arrow forecast.
"""

from world_systems.faction import FactionSystem
from world_systems.ideology import IdeologySystem
from world_systems.incentive import IncentiveSystem
from world_systems.institutional import InstitutionalSystem
from world_systems.media_pressure import MediaPressureSystem
from world_systems.network_contagion import NetworkContagionSystem

ALL_SYSTEMS = [
    IncentiveSystem,
    FactionSystem,
    IdeologySystem,
    NetworkContagionSystem,
    InstitutionalSystem,
    MediaPressureSystem,
]
