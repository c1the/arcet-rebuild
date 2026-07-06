# Candidate-selection data structures 


from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np


VALENCE_FIELDS: tuple[str, ...] = (
    "competence",
    "integrity",
    "experience",
    "local_visibility",
    "campaign_capacity",
    "public_communication",
    "selectorate_support",
    "incumbency_or_name_recognition",
)

INCUMBENCY_STATES: tuple[str, ...] = ("none", "challenger", "incumbent", "former")


def _as_array(x: Any) -> np.ndarray:
    return np.asarray(x, dtype=float).reshape(-1)


# Candidate
@dataclass
class CandidateProfile:


    candidate_id: str
    display_name: str
    party_id: str
    eligible_districts: List[str]
    policy_position: np.ndarray
    valence: Dict[str, float] = field(default_factory=dict)
    local_affinity: Dict[str, float] = field(default_factory=dict)      # district_id -> score
    incumbency_status: Dict[str, str] = field(default_factory=dict)     # district_id -> state
    campaign_capacity: Dict[str, float] = field(default_factory=dict)   # district_id -> score
    selectorate_support: Dict[str, float] = field(default_factory=dict) # district_id -> [0,1]
    public_visibility: Dict[str, float] = field(default_factory=dict)   # district_id -> score
    risk_flags: Dict[str, float] = field(default_factory=dict)          # label -> severity >= 0
    representation_attributes: Dict[str, Any] = field(default_factory=dict)  # For audit
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.policy_position = _as_array(self.policy_position)
        for d, st in self.incumbency_status.items():
            if st not in INCUMBENCY_STATES:
                raise ValueError(
                    f"Candidate '{self.candidate_id}' district '{d}': incumbency_status "
                    f"'{st}' not in {INCUMBENCY_STATES}."
                )

    # Data Qual Diagnostics
    def quality_warnings(self) -> List[str]:
        w: List[str] = []
        if not self.eligible_districts:
            w.append(f"{self.candidate_id}: no eligible_districts supplied.")
        if self.policy_position.size == 0:
            w.append(f"{self.candidate_id}: empty policy_position.")
        if not self.valence:
            w.append(f"{self.candidate_id}: no valence sub-scores; valence treated as uncertain (prior).")
        unknown = set(self.valence) - set(VALENCE_FIELDS)
        if unknown:
            w.append(
                f"{self.candidate_id}: non-standard valence keys {sorted(unknown)} "
                f"will be weighted only if a weight is supplied."
            )
        if not self.local_affinity:
            w.append(f"{self.candidate_id}: no local_affinity; local fit treated as 0 with uncertainty flag.")
        return w



# Electoral environment 

@dataclass
class BlocSpec:

    ideal_point: np.ndarray
    size: float
    expressive_cost: float = 0.5
    info_level: float = 1.0
    label: Optional[str] = None

    def __post_init__(self) -> None:
        self.ideal_point = _as_array(self.ideal_point)


@dataclass
class ContestantSpec:

    contestant_id: str
    policy_position: np.ndarray
    valence: float = 0.0
    local_affinity: Dict[str, float] = field(default_factory=dict)
    incumbency_status: Dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.policy_position = _as_array(self.policy_position)


@dataclass
class DistrictSpec:
    district_id: str
    electorate: float
    turnout: float
    blocs: List[BlocSpec]
    region: Optional[str] = None


@dataclass
class ElectionEnvironment:
    party_id: str
    opponents: List[ContestantSpec]
    districts: List[DistrictSpec]
    default_party_candidate: ContestantSpec  # fills party slot where no option assigned
    beta: float = 1.0                # spatial proximity weight
    incumbency_bonus: float = 0.5
    governing_threshold: int = 0

    @property
    def district_index(self) -> Dict[str, DistrictSpec]:
        return {d.district_id: d for d in self.districts}

    @property
    def contestant_ids(self) -> List[str]:
        return [self.party_id] + [o.contestant_id for o in self.opponents]



# Scoring config

@dataclass
class SelectionObjectiveWeights:
    w_expected_seats: float = 0.0
    w_target_win: float = 0.0
    w_majority: float = 0.0
    w_vote_share: float = 0.0
    w_policy_fit: float = 0.0
    w_candidate_valence: float = 0.0
    w_local_fit: float = 0.0
    w_selectorate_legitimacy: float = 0.0
    w_representation: float = 0.0
    w_risk_penalty: float = 0.0
    target_district: Optional[str] = None
    custom_weights: Dict[str, float] = field(default_factory=dict)

    KNOWN = (
        "w_expected_seats", "w_target_win", "w_majority", "w_vote_share",
        "w_policy_fit", "w_candidate_valence", "w_local_fit",
        "w_selectorate_legitimacy", "w_representation", "w_risk_penalty",
    )

    def unknown_custom(self) -> List[str]:
        return sorted(set(self.custom_weights) - set(self.KNOWN))


@dataclass
class ValenceWeightConfig:

    weights: Dict[str, float] = field(default_factory=dict)

    def resolved(self, present_fields: List[str]) -> Dict[str, float]:
        if self.weights:
            return {f: float(self.weights.get(f, 0.0)) for f in present_fields}
        return {f: 1.0 for f in present_fields}  # uniform prior over present fields


@dataclass
class SelectionConstraint:
    constraint_id: str
    type: str  # eligibility | selectorate | representation | legal | resource | conflict
    params: Dict[str, Any] = field(default_factory=dict)
    hard: bool = True
    penalty: float = 0.0


@dataclass
class CandidateSlate:
    slate_id: str
    assignments: Dict[str, str]  # district_id -> candidate_id
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CandidateSelectionScore:
    option_id: str
    option_type: str  # "candidate_for_district" | "slate"
    J: float
    mean_utility: float
    std_utility: float
    lcb: float
    expected_seats: float
    p_majority: float
    p_target_win: float
    electoral_component: float
    policy_component: float
    valence_component: float
    local_fit_component: float
    selectorate_component: float
    representation_component: float
    risk_penalty: float
    constraint_penalty: float
    constraint_violations: List[str]
    tie_band: int = 0
    explanation: Dict[str, Any] = field(default_factory=dict)



# JSON deserialisation
def candidate_to_dict(c: CandidateProfile) -> Dict[str, Any]:
    d = asdict(c)
    d["policy_position"] = c.policy_position.tolist()
    return d


def candidate_from_dict(d: Dict[str, Any]) -> CandidateProfile:
    required = ("candidate_id", "display_name", "party_id", "eligible_districts", "policy_position")
    missing = [k for k in required if k not in d]
    if missing:
        raise ValueError(f"Candidate JSON missing required fields: {missing} (got keys {sorted(d)})")
    return CandidateProfile(
        candidate_id=str(d["candidate_id"]),
        display_name=str(d["display_name"]),
        party_id=str(d["party_id"]),
        eligible_districts=list(d["eligible_districts"]),
        policy_position=_as_array(d["policy_position"]),
        valence=dict(d.get("valence", {})),
        local_affinity=dict(d.get("local_affinity", {})),
        incumbency_status=dict(d.get("incumbency_status", {})),
        campaign_capacity=dict(d.get("campaign_capacity", {})),
        selectorate_support=dict(d.get("selectorate_support", {})),
        public_visibility=dict(d.get("public_visibility", {})),
        risk_flags=dict(d.get("risk_flags", {})),
        representation_attributes=dict(d.get("representation_attributes", {})),
        metadata=dict(d.get("metadata", {})),
    )


def _contestant_from_dict(d: Dict[str, Any]) -> ContestantSpec:
    return ContestantSpec(
        contestant_id=str(d["contestant_id"]),
        policy_position=_as_array(d["policy_position"]),
        valence=float(d.get("valence", 0.0)),
        local_affinity=dict(d.get("local_affinity", {})),
        incumbency_status=dict(d.get("incumbency_status", {})),
    )


def _bloc_from_dict(d: Dict[str, Any]) -> BlocSpec:
    return BlocSpec(
        ideal_point=_as_array(d["ideal_point"]),
        size=float(d["size"]),
        expressive_cost=float(d.get("expressive_cost", 0.5)),
        info_level=float(d.get("info_level", 1.0)),
        label=d.get("label"),
    )


def environment_from_dict(d: Dict[str, Any]) -> ElectionEnvironment:
    if "default_party_candidate" not in d:
        raise ValueError(
            "Environment JSON needs 'default_party_candidate' (the baseline filling "
            "the party slot in districts with no assigned option)."
        )
    districts = [
        DistrictSpec(
            district_id=str(x["district_id"]),
            electorate=float(x["electorate"]),
            turnout=float(x["turnout"]),
            blocs=[_bloc_from_dict(b) for b in x["blocs"]],
            region=x.get("region"),
        )
        for x in d["districts"]
    ]
    return ElectionEnvironment(
        party_id=str(d["party_id"]),
        opponents=[_contestant_from_dict(o) for o in d.get("opponents", [])],
        districts=districts,
        default_party_candidate=_contestant_from_dict(d["default_party_candidate"]),
        beta=float(d.get("beta", 1.0)),
        incumbency_bonus=float(d.get("incumbency_bonus", 0.5)),
        governing_threshold=int(d.get("governing_threshold", 0)),
    )


def weights_from_dict(d: Dict[str, Any]) -> SelectionObjectiveWeights:
    known = set(SelectionObjectiveWeights.KNOWN) | {"target_district", "custom_weights"}
    kwargs = {k: d[k] for k in d if k in known}
    return SelectionObjectiveWeights(**kwargs)


def load_candidates_json(path: str) -> List[CandidateProfile]:
    with open(path) as fh:
        raw = json.load(fh)
    items = raw["candidate_pool"] if isinstance(raw, dict) and "candidate_pool" in raw else raw
    return [candidate_from_dict(x) for x in items]
