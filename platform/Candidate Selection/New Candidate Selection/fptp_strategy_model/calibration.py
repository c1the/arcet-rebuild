# Calibration hooks 


from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .candidate_transform import CoefPriors


@dataclass
class CandidateCalibration:


    priors: CoefPriors = field(default_factory=CoefPriors)
    fitted: bool = False
    coefficient_uncertainty: Dict[str, float] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)

    @classmethod
    def default(cls) -> "CandidateCalibration":
        c = cls()
        c.notes.append(
            "Uncalibrated: using labelled priors (risk_voter_coef, visibility_coef). "
            "No historical fit performed."
        )
        return c

    @classmethod
    def from_history(cls, history: Optional[Dict[str, Any]]) -> "CandidateCalibration":
 
        if not history:
            return cls.default()
        c = cls.default()
        c.notes.append(
            "from_history called with data, but coefficient fitting is not "
            "implemented in this build; falling back to labelled priors. "
            "Do not treat coefficients as estimated."
        )
        return c
