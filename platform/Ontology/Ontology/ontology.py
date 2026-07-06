"""Ontology integration layer.
=============================

Bridges this FPTP engine to the ``@arcet/ontology`` package. The ontology is the
system of record (TypeScript/Prisma); this engine is a *consumer* of it. The two
talk over a JSON contract, so this module:

  1. Mirrors the ontology's FPTP enums and the ``FPTPContext`` /
     ``SaveFPTPScenarioInput`` shapes as Python dataclasses, with
     ``from_dict`` / ``to_payload`` for the ontology's camelCase JSON.
  2. Maps a single-constituency ``FPTPContext`` onto this engine's
     ``ElectionConfig`` + ``DistrictData`` inputs (with explicit, overridable
     modelling assumptions — see ``district_from_context``).
  3. Runs the existing Monte Carlo engine over that single-seat contest to
     estimate win probability and a vote-share band.
  4. Distils the result to the ontology's strategic vocabulary using
     ``recommendation_label`` — a faithful port of the ontology's
     ``rules.ts`` ``fptpRules`` so the two systems never disagree on a label.
  5. Emits a ``FPTPScenarioInput`` ready to POST to ``/api/fptp/scenarios``.

Nothing here reimplements the simulation; it reuses the engine components.
The optional ``OntologyClient`` (stdlib only) calls the ontology REST API.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from .actions import Action
from .campaign import CampaignResponseModel
from .config import Bloc, DistrictData, ElectionConfig
from .entry import EntryCoordinationModel
from .mechanical import MechanicalSeatModel
from .preferences import VoteModel
from .simulate import Simulator
from .state import StateSampler
from .strategic import StrategicParams, StrategicVotingModel


# --------------------------------------------------------------------------- #
# Enums — values match the ontology's enums.ts verbatim.
# --------------------------------------------------------------------------- #
class FPTPRecommendationLabel(str, Enum):
    COMPETE_HARD = "COMPETE_HARD"
    COMPETE_SELECTIVELY = "COMPETE_SELECTIVELY"
    SYMBOLIC_RUN = "SYMBOLIC_RUN"
    STAND_ASIDE = "STAND_ASIDE"
    DO_NOT_INVEST = "DO_NOT_INVEST"
    CHANGE_CANDIDATE = "CHANGE_CANDIDATE"
    GATHER_MORE_DATA = "GATHER_MORE_DATA"
    ESCALATE_TO_STRATEGIST = "ESCALATE_TO_STRATEGIST"


class FPTPScenarioType(str, Enum):
    RUN_HARD = "RUN_HARD"
    RUN_SOFT = "RUN_SOFT"
    STAND_ASIDE = "STAND_ASIDE"
    CHANGE_CANDIDATE = "CHANGE_CANDIDATE"
    INCREASE_RESOURCES = "INCREASE_RESOURCES"
    DECREASE_RESOURCES = "DECREASE_RESOURCES"
    GATHER_MORE_DATA = "GATHER_MORE_DATA"


class Confidence(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CONFIRMED = "CONFIRMED"


class TargetStatus(str, Enum):
    SAFE = "SAFE"
    LIKELY = "LIKELY"
    LEAN = "LEAN"
    MARGINAL = "MARGINAL"
    TARGET = "TARGET"
    LONG_SHOT = "LONG_SHOT"
    UNWINNABLE = "UNWINNABLE"
    UNKNOWN = "UNKNOWN"


class StrategicPriority(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    MONITOR_ONLY = "MONITOR_ONLY"


# Default mapping from the strategic recommendation to the ontology's
# scenario-type ("action") vocabulary. Overridable by callers.
DEFAULT_LABEL_TO_SCENARIO: Dict[FPTPRecommendationLabel, FPTPScenarioType] = {
    FPTPRecommendationLabel.COMPETE_HARD: FPTPScenarioType.RUN_HARD,
    FPTPRecommendationLabel.COMPETE_SELECTIVELY: FPTPScenarioType.RUN_SOFT,
    FPTPRecommendationLabel.SYMBOLIC_RUN: FPTPScenarioType.RUN_SOFT,
    FPTPRecommendationLabel.STAND_ASIDE: FPTPScenarioType.STAND_ASIDE,
    FPTPRecommendationLabel.DO_NOT_INVEST: FPTPScenarioType.DECREASE_RESOURCES,
    FPTPRecommendationLabel.CHANGE_CANDIDATE: FPTPScenarioType.CHANGE_CANDIDATE,
    FPTPRecommendationLabel.GATHER_MORE_DATA: FPTPScenarioType.GATHER_MORE_DATA,
    FPTPRecommendationLabel.ESCALATE_TO_STRATEGIST: FPTPScenarioType.GATHER_MORE_DATA,
}

# Ordinal-enum -> 0..100 score maps (assumptions; documented, overridable).
STRATEGIC_PRIORITY_SCORE: Dict[str, float] = {
    "CRITICAL": 95.0, "HIGH": 80.0, "MEDIUM": 55.0, "LOW": 30.0, "MONITOR_ONLY": 10.0,
}
TARGET_STATUS_SCORE: Dict[str, float] = {
    "SAFE": 95.0, "LIKELY": 80.0, "LEAN": 65.0, "MARGINAL": 50.0,
    "TARGET": 55.0, "LONG_SHOT": 25.0, "UNWINNABLE": 5.0, "UNKNOWN": 50.0,
}


# --------------------------------------------------------------------------- #
# Inbound contract — mirrors ontology FPTPContext (JSON is camelCase).
# --------------------------------------------------------------------------- #
def _g(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Get the first present key (tolerates camelCase / snake_case)."""
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


@dataclass
class ElectionHistoryRow:
    election_date: Optional[str]
    party_entity_id: Optional[str]
    candidate_entity_id: Optional[str]
    votes: float
    vote_share: float
    position: int

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ElectionHistoryRow":
        return cls(
            election_date=_g(d, "electionDate", "election_date"),
            party_entity_id=_g(d, "partyEntityId", "party_entity_id"),
            candidate_entity_id=_g(d, "candidateEntityId", "candidate_entity_id"),
            votes=float(_g(d, "votes", default=0.0)),
            vote_share=float(_g(d, "voteShare", "vote_share", default=0.0)),
            position=int(_g(d, "position", default=0)),
        )


@dataclass
class SeatAssessment:
    overall_fit_score: Optional[float] = None
    readiness_score: Optional[float] = None
    local_connection_score: Optional[float] = None
    risk_score: Optional[float] = None
    development_potential_score: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Optional[Dict[str, Any]]) -> Optional["SeatAssessment"]:
        if not d:
            return None
        return cls(
            overall_fit_score=_g(d, "overallFitScore", "overall_fit_score"),
            readiness_score=_g(d, "readinessScore", "readiness_score"),
            local_connection_score=_g(d, "localConnectionScore", "local_connection_score"),
            risk_score=_g(d, "riskScore", "risk_score"),
            development_potential_score=_g(d, "developmentPotentialScore", "development_potential_score"),
            raw=dict(d),
        )


@dataclass
class FPTPContext:
    constituency_entity_id: str
    candidate_entity_id: Optional[str] = None
    election_history: List[ElectionHistoryRow] = field(default_factory=list)
    seat_assessment: Optional[SeatAssessment] = None
    local_party_strength: Optional[float] = None        # 1..5
    stakeholder_coverage_score: Optional[float] = None  # 0..100
    issue_volatility: Optional[float] = None            # 1..5
    tactical_voting_risk: Optional[float] = None        # 1..5
    spoiler_risk: Optional[float] = None                # 1..5
    target_status: Optional[str] = None
    strategic_priority: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "FPTPContext":
        return cls(
            constituency_entity_id=_g(d, "constituencyEntityId", "constituency_entity_id"),
            candidate_entity_id=_g(d, "candidateEntityId", "candidate_entity_id"),
            election_history=[ElectionHistoryRow.from_dict(r) for r in _g(d, "electionHistory", "election_history", default=[])],
            seat_assessment=SeatAssessment.from_dict(_g(d, "seatAssessment", "seat_assessment")),
            local_party_strength=_g(d, "localPartyStrength", "local_party_strength"),
            stakeholder_coverage_score=_g(d, "stakeholderCoverageScore", "stakeholder_coverage_score"),
            issue_volatility=_g(d, "issueVolatility", "issue_volatility"),
            tactical_voting_risk=_g(d, "tacticalVotingRisk", "tactical_voting_risk"),
            spoiler_risk=_g(d, "spoilerRisk", "spoiler_risk"),
            target_status=_g(d, "targetStatus", "target_status"),
            strategic_priority=_g(d, "strategicPriority", "strategic_priority"),
        )


# --------------------------------------------------------------------------- #
# Outbound contract — mirrors ontology SaveFPTPScenarioInput.
# --------------------------------------------------------------------------- #
@dataclass
class FPTPScenarioInput:
    constituency_entity_id: str
    scenario_type: FPTPScenarioType
    title: str
    candidate_entity_id: Optional[str] = None
    assumptions: Optional[Dict[str, Any]] = None
    estimated_win_probability: Optional[float] = None   # 0..1
    estimated_vote_share_low: Optional[float] = None     # 0..100
    estimated_vote_share_mid: Optional[float] = None
    estimated_vote_share_high: Optional[float] = None
    strategic_value_score: Optional[float] = None
    resource_waste_risk: Optional[float] = None
    spoiler_risk: Optional[float] = None
    tactical_voting_risk: Optional[float] = None
    local_party_impact: Optional[str] = None
    stakeholder_impact: Optional[str] = None
    candidate_development_value: Optional[float] = None
    future_election_value: Optional[float] = None
    recommendation_label: Optional[FPTPRecommendationLabel] = None
    rationale: Optional[str] = None
    confidence: Optional[Confidence] = None

    def to_payload(self) -> Dict[str, Any]:
        """camelCase JSON body for POST /api/fptp/scenarios. Omits None fields."""
        raw = {
            "constituencyEntityId": self.constituency_entity_id,
            "candidateEntityId": self.candidate_entity_id,
            "scenarioType": self.scenario_type.value if self.scenario_type else None,
            "title": self.title,
            "assumptions": self.assumptions,
            "estimatedWinProbability": self.estimated_win_probability,
            "estimatedVoteShareLow": self.estimated_vote_share_low,
            "estimatedVoteShareMid": self.estimated_vote_share_mid,
            "estimatedVoteShareHigh": self.estimated_vote_share_high,
            "strategicValueScore": self.strategic_value_score,
            "resourceWasteRisk": self.resource_waste_risk,
            "spoilerRisk": self.spoiler_risk,
            "tacticalVotingRisk": self.tactical_voting_risk,
            "localPartyImpact": self.local_party_impact,
            "stakeholderImpact": self.stakeholder_impact,
            "candidateDevelopmentValue": self.candidate_development_value,
            "futureElectionValue": self.future_election_value,
            "recommendationLabel": self.recommendation_label.value if self.recommendation_label else None,
            "rationale": self.rationale,
            "confidence": self.confidence.value if self.confidence else None,
        }
        return {k: v for k, v in raw.items() if v is not None}


# --------------------------------------------------------------------------- #
# Shared recommendation rule — faithful port of ontology rules.ts `fptpRules`.
# Keeping the thresholds identical guarantees the engine and the ontology never
# disagree on the label for the same strategic inputs.
# --------------------------------------------------------------------------- #
def recommendation_label(
    win_probability: Optional[float],
    future_election_value: Optional[float],
    strategic_value: Optional[float],
    candidate_fit: Optional[float],
    seat_strategically_important: bool,
) -> Tuple[FPTPRecommendationLabel, str]:
    wp = win_probability if win_probability is not None else 0.0
    future = future_election_value if future_election_value is not None else 0.0
    strategic = strategic_value if strategic_value is not None else 0.0
    fit = candidate_fit if candidate_fit is not None else 0.0

    label = FPTPRecommendationLabel.GATHER_MORE_DATA
    rationale = "Insufficient signal; gather more local data before committing resources."

    if wp < 0.25 and future >= 60:
        label = FPTPRecommendationLabel.SYMBOLIC_RUN
        rationale = "Low win probability but high future-election value: run to build the seat."
    elif wp < 0.25 and strategic < 40:
        label = FPTPRecommendationLabel.DO_NOT_INVEST
        rationale = "Low win probability and low strategic value: do not invest."
    elif fit < 40 and seat_strategically_important:
        label = FPTPRecommendationLabel.CHANGE_CANDIDATE
        rationale = "Weak candidate fit in a strategically important seat: change candidate or gather more data."
    elif wp >= 0.5:
        label = FPTPRecommendationLabel.COMPETE_HARD
        rationale = "Win probability is favourable: compete hard."
    elif wp >= 0.25:
        label = FPTPRecommendationLabel.COMPETE_SELECTIVELY
        rationale = "Competitive but uncertain: compete selectively with targeted resources."
    return label, rationale


# --------------------------------------------------------------------------- #
# Context -> engine inputs.
# --------------------------------------------------------------------------- #
def _strength_1to5_to_score(v: Optional[float]) -> Optional[float]:
    """Map a 1..5 ordinal onto 0..100."""
    if v is None:
        return None
    return float(np.clip((float(v) - 1.0) / 4.0 * 100.0, 0.0, 100.0))


def _volatility_to_sigma(issue_volatility: Optional[float], default: float = 0.05) -> float:
    """A 1..5 issue-volatility maps to a perceived share sigma in [0.03, 0.12]."""
    if issue_volatility is None:
        return default
    frac = np.clip((float(issue_volatility) - 1.0) / 4.0, 0.0, 1.0)
    return float(0.03 + 0.09 * frac)


def district_from_context(
    ctx: FPTPContext,
    candidate_party: str,
    *,
    district_id: Optional[str] = None,
    secondary_utility: float = 1.0,
    own_utility: float = 5.0,
    fit_valence_strength: float = 1.5,
    expressive_cost: float = 0.5,
    info_level: float = 1.0,
    party_priors: Optional[Dict[str, float]] = None,
) -> DistrictData:
    """Build a single-member ``DistrictData`` from a constituency context.

    Modelling assumptions (all overridable):
      * One voter bloc per party, sized by that party's most-recent vote share
        (or ``party_priors`` if no usable history). Each bloc strongly prefers
        its own party (``own_utility``) and is indifferent between the others
        (``secondary_utility``) — so tactical desertion flows to whichever rival
        is most viable, which is the Duvergerian behaviour we want by default.
      * Candidate quality is a *valence* bump applied to ``candidate_party`` in
        every bloc, scaled from the seat assessment's overall fit (centred at
        50): a strong candidate lifts the party with persuadable voters.
      * ``candidate_party`` is guaranteed to be present even with no history.

    For richer inputs, build ``DistrictData`` directly and skip this helper.
    """
    # Party vote shares from the most recent election in history.
    shares: Dict[str, float] = {}
    if ctx.election_history:
        latest_date = max((r.election_date or "") for r in ctx.election_history)
        for r in ctx.election_history:
            if (r.election_date or "") == latest_date and r.party_entity_id:
                shares[r.party_entity_id] = shares.get(r.party_entity_id, 0.0) + max(r.vote_share, 0.0)
    if not shares and party_priors:
        shares = {p: max(v, 0.0) for p, v in party_priors.items()}
    if candidate_party not in shares:
        # Seed the candidate's party from local party strength (or a small base).
        seed = (_strength_1to5_to_score(ctx.local_party_strength) or 20.0) / 100.0
        shares[candidate_party] = max(seed, 0.05)
    if len(shares) < 2:
        # Need at least a notional opponent for a contest.
        shares["OTHERS"] = max(1.0 - sum(shares.values()), 0.1)

    total = sum(shares.values())
    shares = {p: v / total for p, v in shares.items()}
    parties = sorted(shares)

    # Candidate-quality valence (centred at 50 -> 0).
    fit = None
    if ctx.seat_assessment is not None:
        fit = ctx.seat_assessment.overall_fit_score
        if fit is None:
            fit = ctx.seat_assessment.local_connection_score
    fit_bump = 0.0 if fit is None else fit_valence_strength * (float(fit) - 50.0) / 50.0

    blocs: List[Bloc] = []
    for p in parties:
        utility = {q: (own_utility if q == p else secondary_utility) for q in parties}
        utility[candidate_party] = utility.get(candidate_party, secondary_utility) + fit_bump
        blocs.append(Bloc(size=shares[p], utility=utility,
                          expressive_cost=expressive_cost, info_level=info_level, label=f"base:{p}"))

    return DistrictData(
        district_id=district_id or ctx.constituency_entity_id,
        electorate=100_000,
        turnout=0.65,
        blocs=blocs,
        candidates_present=parties,
    )


def derive_strategic_inputs(ctx: FPTPContext) -> Dict[str, Any]:
    """Distil the ontology context into the inputs the label rule expects."""
    # Strategic value: from strategic priority, falling back to target status.
    if ctx.strategic_priority and ctx.strategic_priority in STRATEGIC_PRIORITY_SCORE:
        strategic_value = STRATEGIC_PRIORITY_SCORE[ctx.strategic_priority]
    elif ctx.target_status and ctx.target_status in TARGET_STATUS_SCORE:
        strategic_value = TARGET_STATUS_SCORE[ctx.target_status]
    else:
        strategic_value = 50.0

    # Future-election value: blend of local party strength and development potential.
    parts = []
    ps = _strength_1to5_to_score(ctx.local_party_strength)
    if ps is not None:
        parts.append(ps)
    if ctx.seat_assessment and ctx.seat_assessment.development_potential_score is not None:
        parts.append(float(ctx.seat_assessment.development_potential_score))
    future_value = float(np.mean(parts)) if parts else 50.0

    fit = None
    dev = None
    if ctx.seat_assessment is not None:
        fit = ctx.seat_assessment.overall_fit_score
        if fit is None:
            fit = ctx.seat_assessment.local_connection_score
        dev = ctx.seat_assessment.development_potential_score

    seat_important = (ctx.strategic_priority in ("CRITICAL", "HIGH")) or (
        ctx.target_status in ("TARGET", "MARGINAL", "LEAN")
    )

    return {
        "strategic_value": strategic_value,
        "future_election_value": future_value,
        "candidate_fit": float(fit) if fit is not None else None,
        "candidate_development_value": float(dev) if dev is not None else None,
        "seat_strategically_important": bool(seat_important),
    }


# --------------------------------------------------------------------------- #
# End-to-end: context -> simulation -> scenario input.
# --------------------------------------------------------------------------- #
@dataclass
class ConstituencyAssessment:
    """The full result: the ontology-ready input plus the raw simulation stats."""
    scenario_input: FPTPScenarioInput
    win_probability: float
    vote_share_band: Tuple[float, float, float]  # (low, mid, high) on 0..100
    converged_fraction: float
    raw: Dict[str, Any] = field(default_factory=dict)


def assess_constituency(
    ctx: FPTPContext,
    candidate_party: str,
    *,
    n_simulations: int = 800,
    seed: int = 0,
    vote_model: Optional[VoteModel] = None,
    strategic_params: Optional[StrategicParams] = None,
    sampler_kwargs: Optional[Dict[str, Any]] = None,
    title: Optional[str] = None,
    district_kwargs: Optional[Dict[str, Any]] = None,
    label_to_scenario: Optional[Dict[FPTPRecommendationLabel, FPTPScenarioType]] = None,
) -> ConstituencyAssessment:
    """Run the engine over one seat and return an ontology ``FPTPScenarioInput``.

    Win probability and the vote-share band come from the Monte Carlo
    simulation; strategic value, future-election value, candidate fit and
    importance come from the ontology context; the recommendation label is the
    shared rule applied to both. This is the single function a caller needs.
    """
    district = district_from_context(ctx, candidate_party, **(district_kwargs or {}))
    config = ElectionConfig(
        candidate_ids=list(district.candidates_present),
        governing_threshold=0,
        allowed_action_types=["status_quo"],
    )
    sampler = StateSampler(
        base_districts=[district],
        config=config,
        seed=seed,
        perceived_sigma=_volatility_to_sigma(ctx.issue_volatility),
        **(sampler_kwargs or {}),
    )
    vm = vote_model or VoteModel(tau=0.30)
    strat = StrategicVotingModel(vm, strategic_params or StrategicParams())
    sim = Simulator(
        sampler=sampler,
        vote_model=vm,
        strategic_model=strat,
        mechanical_model=MechanicalSeatModel(),
        campaign=CampaignResponseModel(),
        coordination=EntryCoordinationModel(),
        candidates=list(config.candidate_ids),
    )

    res = sim.run_action(Action("status_quo", candidate_party, label="status_quo"),
                         n_simulations=n_simulations, use_strategic=True)

    wins = [1.0 if (o.winners and o.winners[0] == candidate_party) else 0.0 for o in res.outcomes]
    shares = np.array([o.national_vote_share.get(candidate_party, 0.0) for o in res.outcomes])
    win_prob = float(np.mean(wins)) if wins else 0.0
    low, mid, high = (float(np.quantile(shares, q)) * 100.0 for q in (0.10, 0.50, 0.90))
    converged_fraction = 1.0 - (res.n_nonconverged / max(1, n_simulations))

    si = derive_strategic_inputs(ctx)
    label, rationale = recommendation_label(
        win_probability=win_prob,
        future_election_value=si["future_election_value"],
        strategic_value=si["strategic_value"],
        candidate_fit=si["candidate_fit"],
        seat_strategically_important=si["seat_strategically_important"],
    )
    scenario_type = (label_to_scenario or DEFAULT_LABEL_TO_SCENARIO).get(
        label, FPTPScenarioType.GATHER_MORE_DATA
    )

    # Confidence from simulation stability + decisiveness of the win probability.
    if converged_fraction < 0.98:
        confidence = Confidence.LOW
    elif win_prob <= 0.12 or win_prob >= 0.88:
        confidence = Confidence.HIGH
    else:
        confidence = Confidence.MEDIUM

    # Resource-waste risk: effort likely wasted, discounted by strategic value
    # (a strategically vital seat is never simply "wasted").
    resource_waste = float(np.clip((1.0 - win_prob) * (1.0 - si["strategic_value"] / 100.0) * 100.0, 0.0, 100.0))

    scenario = FPTPScenarioInput(
        constituency_entity_id=ctx.constituency_entity_id,
        candidate_entity_id=ctx.candidate_entity_id,
        scenario_type=scenario_type,
        title=title or f"FPTP assessment for {candidate_party}",
        assumptions={
            "engine": "fptp_strategy_model",
            "n_simulations": n_simulations,
            "seed": seed,
            "candidate_party": candidate_party,
            "perceived_sigma": _volatility_to_sigma(ctx.issue_volatility),
            "tau": vm.tau,
            "parties": list(config.candidate_ids),
        },
        estimated_win_probability=round(win_prob, 4),
        estimated_vote_share_low=round(low, 2),
        estimated_vote_share_mid=round(mid, 2),
        estimated_vote_share_high=round(high, 2),
        strategic_value_score=round(si["strategic_value"], 2),
        resource_waste_risk=round(resource_waste, 2),
        spoiler_risk=_strength_1to5_to_score(ctx.spoiler_risk),
        tactical_voting_risk=_strength_1to5_to_score(ctx.tactical_voting_risk),
        local_party_impact=(
            f"Local party strength {ctx.local_party_strength}/5"
            if ctx.local_party_strength is not None else None
        ),
        stakeholder_impact=(
            f"Stakeholder coverage {ctx.stakeholder_coverage_score:.0f}/100"
            if ctx.stakeholder_coverage_score is not None else None
        ),
        candidate_development_value=(
            round(si["candidate_development_value"], 2)
            if si["candidate_development_value"] is not None else None
        ),
        future_election_value=round(si["future_election_value"], 2),
        recommendation_label=label,
        rationale=rationale,
        confidence=confidence,
    )

    return ConstituencyAssessment(
        scenario_input=scenario,
        win_probability=win_prob,
        vote_share_band=(round(low, 2), round(mid, 2), round(high, 2)),
        converged_fraction=converged_fraction,
        raw={"shares_mean": float(shares.mean()) if shares.size else 0.0,
             "strategic_inputs": si},
    )


# --------------------------------------------------------------------------- #
# Optional thin REST client (stdlib only) for the ontology API.
# --------------------------------------------------------------------------- #
class OntologyClient:
    """Minimal client for the ontology REST API. Uses only the standard library.

    Endpoints (see the ontology's src/api):
      GET  /api/fptp/{constituencyId}/context?candidateId=...
      POST /api/fptp/scenarios
    """

    def __init__(self, base_url: str, *, token: Optional[str] = None, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        import urllib.request

        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            payload = resp.read().decode("utf-8")
        return json.loads(payload) if payload else None

    def get_fptp_context(self, constituency_id: str, candidate_id: Optional[str] = None) -> FPTPContext:
        path = f"/api/fptp/{constituency_id}/context"
        if candidate_id:
            path += f"?candidateId={candidate_id}"
        return FPTPContext.from_dict(self._request("GET", path))

    def save_fptp_scenario(self, scenario: FPTPScenarioInput) -> Dict[str, Any]:
        return self._request("POST", "/api/fptp/scenarios", scenario.to_payload())

    def assess_and_save(
        self, constituency_id: str, candidate_party: str, *, candidate_id: Optional[str] = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Convenience: fetch context, assess, and persist the scenario."""
        ctx = self.get_fptp_context(constituency_id, candidate_id)
        assessment = assess_constituency(ctx, candidate_party, **kwargs)
        return self.save_fptp_scenario(assessment.scenario_input)
