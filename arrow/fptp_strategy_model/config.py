#Configuration and input data structures for the FPTP strategy model.



from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import numpy as np



# Voter blocs

@dataclass
class Bloc:


    size: float
    utility: Dict[str, float]
    expressive_cost: float = 0.5
    info_level: float = 1.0
    label: Optional[str] = None

    def ordering(self, candidates: Sequence[str]) -> List[str]:
        """Candidates restricted to `candidates`, sorted best -> worst."""
        present = [c for c in candidates if c in self.utility]
        return sorted(present, key=lambda c: self.utility[c], reverse=True)


# --------------------------------------------------------------------------- #
# Districts
# --------------------------------------------------------------------------- #
@dataclass
class DistrictData:


    district_id: str
    electorate: float
    turnout: float
    blocs: List[Bloc]
    candidates_present: Optional[List[str]] = None
    incumbent: Optional[str] = None
    region: Optional[str] = None

    def __post_init__(self) -> None:
        if self.candidates_present is None:
            seen: List[str] = []
            for b in self.blocs:
                for c in b.utility:
                    if c not in seen:
                        seen.append(c)
            self.candidates_present = seen
        # Defensive renormalisation of bloc masses.
        total = sum(b.size for b in self.blocs)
        if total <= 0:
            raise ValueError(f"District {self.district_id}: bloc sizes sum to {total}.")
        if not np.isclose(total, 1.0):
            for b in self.blocs:
                b.size = b.size / total

    @property
    def voters(self) -> float:
        """Expected number of votes cast in the district."""
        return self.electorate * self.turnout



# Whole-election configuration

# The lawful, aggregate action *types* this tool will ever consider. Anything
# outside this list is refused by the DecisionEngine. There is deliberately no
# action type for individual-level persuasion, micro-targeting or deception.
ALLOWED_ACTION_TYPES = {
    "status_quo",      # do nothing differently
    "allocate",        # shift aggregate resources (spend/visits/field) across districts
    "reposition",      # move a platform along an issue dimension (with core-base cost)
    "mobilise",        # raise own-supporter turnout at aggregate district level
    "withdraw",        # a candidate stands down
    "endorse",         # a candidate stands down and endorses another
    "release_info",    # publish viability information (a poll); changes beliefs, not preferences
}


@dataclass
class ElectionConfig:
    """Static description of the whole contest."""

    candidate_ids: List[str]
    governing_threshold: int = 0  # seats needed for "control"; 0 => not modelled
    seats_per_district: int = 1
    allowed_action_types: List[str] = field(
        default_factory=lambda: sorted(ALLOWED_ACTION_TYPES)
    )

    def __post_init__(self) -> None:
        if self.seats_per_district != 1:
            raise NotImplementedError(
                "This model implements single-member plurality (M=1) only."
            )
        bad = set(self.allowed_action_types) - ALLOWED_ACTION_TYPES
        if bad:
            raise ValueError(f"Unknown / disallowed action types: {sorted(bad)}")
