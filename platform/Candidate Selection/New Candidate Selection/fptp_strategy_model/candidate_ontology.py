"""Candidate-selection ontology integration.
============================================

Bridges the candidate-selection engine to the ``@arcet/ontology`` package, the
mirror image of ``ontology.py`` (which does this for the FPTP strategy model).

What lines up cleanly:
  * **Enums** (`CandidateStatus`, `VettingStatus`, `Confidence`) match `enums.ts`.
  * **Contracts** `CandidateSeatContext` (inbound) and `CandidateSeatAssessment`
    / `CandidateComparisonResult` (outbound) mirror `types.ts`, with
    `from_dict` / `to_payload` for the API's camelCase.
  * **`assess_seat_fit`** is a faithful Python port of the ontology's
    deterministic `calculateCandidateSeatAssessment` (same `FIT_WEIGHTS`, same
    risk discount, same strengths/weaknesses/actions/confidence logic). So the
    Python side can reproduce the ontology's own fit score *exactly* — the
    candidate-selection analogue of the shared FPTP label rule.

What does NOT line up — and the honest boundary:
  The ontology models a candidate as a bundle of 0–100 competency sub-scores
  plus relationship/faction graph signal. It does **not** carry an ideological
  position vector, which the spatial simulation engine needs. So the engine's
  *electoral* dimension (win probability, expected seats) cannot be conjured
  from ontology context alone — the spatial `ElectionEnvironment` must come from
  the caller (or be seeded from election history as in `ontology.py`). This
  module therefore keeps the ontology fit assessment canonical and treats the
  engine's electoral simulation as an *optional overlay* on the comparison.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from .candidate import CandidateProfile
from .candidate_selection import CandidateSelectionReport
from .ontology import Confidence, OntologyClient, _g


# --------------------------------------------------------------------------- #
# Enums — values match enums.ts verbatim.
# --------------------------------------------------------------------------- #
class CandidateStatus(str, Enum):
    POTENTIAL = "POTENTIAL"
    APPROACHED = "APPROACHED"
    DECLARED = "DECLARED"
    LONG_LISTED = "LONG_LISTED"
    SHORT_LISTED = "SHORT_LISTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    SELECTED = "SELECTED"
    DESELECTED = "DESELECTED"
    WITHDRAWN = "WITHDRAWN"
    ELECTED = "ELECTED"
    UNKNOWN = "UNKNOWN"


class VettingStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    CLEARED = "CLEARED"
    FLAGGED = "FLAGGED"
    FAILED = "FAILED"


# The fit-blend weights — identical to FIT_WEIGHTS in candidate-context.service.ts.
FIT_WEIGHTS: Dict[str, float] = {
    "readiness": 0.18,
    "localConnection": 0.16,
    "stakeholderCoverage": 0.14,
    "localAssociationSupport": 0.12,
    "factionAcceptability": 0.12,
    "mediaReadiness": 0.10,
    "issueCredibility": 0.10,
    "developmentPotential": 0.08,
}


# --------------------------------------------------------------------------- #
# Numeric helpers — replicate db.ts (avg / weightedAvg / clamp / round).
# --------------------------------------------------------------------------- #
def _avg(values: Sequence[Optional[float]], fallback: float = 0.0) -> float:
    xs = [float(v) for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]
    return sum(xs) / len(xs) if xs else fallback


def _weighted_avg(pairs: Sequence[tuple], fallback: float = 0.0) -> float:
    num = den = 0.0
    for value, weight in pairs:
        if value is not None and not (isinstance(value, float) and math.isnan(value)):
            num += value * weight
            den += weight
    return num / den if den else fallback


def _clamp(n: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, n))


def _round_half_up(x: float) -> int:
    """Match JS Math.round (round half toward +infinity)."""
    return int(math.floor(x + 0.5))


# --------------------------------------------------------------------------- #
# Inbound contract — the ontology candidate profile + seat signal.
# --------------------------------------------------------------------------- #
@dataclass
class OntologyCandidateProfile:
    political_experience_score: Optional[float] = None
    local_connection_score: Optional[float] = None
    media_readiness_score: Optional[float] = None
    stakeholder_strength_score: Optional[float] = None
    local_association_support_score: Optional[float] = None
    faction_acceptability_score: Optional[float] = None
    issue_credibility_score: Optional[float] = None
    campaign_capacity_score: Optional[float] = None
    risk_score: Optional[float] = None
    development_potential_score: Optional[float] = None
    overall_readiness_score: Optional[float] = None
    candidate_status: Optional[str] = None
    vetting_status: Optional[str] = None
    party_entity_id: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "OntologyCandidateProfile":
        return cls(
            political_experience_score=_g(d, "politicalExperienceScore", "political_experience_score"),
            local_connection_score=_g(d, "localConnectionScore", "local_connection_score"),
            media_readiness_score=_g(d, "mediaReadinessScore", "media_readiness_score"),
            stakeholder_strength_score=_g(d, "stakeholderStrengthScore", "stakeholder_strength_score"),
            local_association_support_score=_g(d, "localAssociationSupportScore", "local_association_support_score"),
            faction_acceptability_score=_g(d, "factionAcceptabilityScore", "faction_acceptability_score"),
            issue_credibility_score=_g(d, "issueCredibilityScore", "issue_credibility_score"),
            campaign_capacity_score=_g(d, "campaignCapacityScore", "campaign_capacity_score"),
            risk_score=_g(d, "riskScore", "risk_score"),
            development_potential_score=_g(d, "developmentPotentialScore", "development_potential_score"),
            overall_readiness_score=_g(d, "overallReadinessScore", "overall_readiness_score"),
            candidate_status=_g(d, "candidateStatus", "candidate_status"),
            vetting_status=_g(d, "vettingStatus", "vetting_status"),
            party_entity_id=_g(d, "partyEntityId", "party_entity_id"),
        )


@dataclass
class CandidateSeatContext:
    """Per-candidate context for a target seat (what getCandidateSeatContext gives)."""
    candidate_entity_id: str
    constituency_entity_id: str
    profile: OntologyCandidateProfile
    display_name: str = ""
    relationship_count: int = 0
    faction_link_count: int = 0
    open_risk_count: int = 0
    # Optional live signal; when absent the stored scores are used (the ontology
    # would refine these with the relationship graph).
    live_stakeholder_coverage: Optional[float] = None
    faction_attitude_scores: Optional[List[float]] = None
    # Optional fields the ontology does not score but a caller may supply.
    policy_position: Optional[List[float]] = None
    representation_attributes: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CandidateSeatContext":
        prof_raw = _g(d, "profile", "candidate", default={}) or {}
        entity = _g(d, "entity", default={}) or {}
        return cls(
            candidate_entity_id=_g(d, "candidateEntityId", "candidate_entity_id",
                                   default=_g(entity, "id", default="")),
            constituency_entity_id=_g(d, "constituencyEntityId", "constituency_entity_id", default=""),
            profile=OntologyCandidateProfile.from_dict(prof_raw),
            display_name=_g(d, "displayName", "display_name", default=_g(entity, "displayName", default="")),
            relationship_count=int(_g(d, "relationshipCount", "relationship_count", default=0)),
            faction_link_count=int(_g(d, "factionLinkCount", "faction_link_count", default=0)),
            open_risk_count=int(_g(d, "openRiskCount", "open_risk_count", default=0)),
            live_stakeholder_coverage=_g(d, "liveStakeholderCoverage", "live_stakeholder_coverage"),
            faction_attitude_scores=_g(d, "factionAttitudeScores", "faction_attitude_scores"),
            policy_position=_g(d, "policyPosition", "policy_position"),
            representation_attributes=dict(_g(d, "representationAttributes", "representation_attributes", default={}) or {}),
            metadata=dict(_g(d, "metadata", default={}) or {}),
        )


# --------------------------------------------------------------------------- #
# Outbound contracts — mirror CandidateSeatAssessmentResult / CandidateComparison.
# --------------------------------------------------------------------------- #
@dataclass
class CandidateSeatAssessment:
    candidate_entity_id: str
    constituency_entity_id: str
    overall_fit_score: int
    readiness_score: int
    local_connection_score: int
    stakeholder_coverage_score: int
    local_association_support_score: int
    faction_acceptability_score: int
    media_readiness_score: int
    issue_credibility_score: int
    risk_score: int
    development_potential_score: int
    summary: str
    top_strengths: List[str]
    top_weaknesses: List[str]
    recommended_actions: List[str]
    evidence_summary: str
    confidence: Confidence

    def to_payload(self) -> Dict[str, Any]:
        return {
            "candidateEntityId": self.candidate_entity_id,
            "constituencyEntityId": self.constituency_entity_id,
            "overallFitScore": self.overall_fit_score,
            "readinessScore": self.readiness_score,
            "localConnectionScore": self.local_connection_score,
            "stakeholderCoverageScore": self.stakeholder_coverage_score,
            "localAssociationSupportScore": self.local_association_support_score,
            "factionAcceptabilityScore": self.faction_acceptability_score,
            "mediaReadinessScore": self.media_readiness_score,
            "issueCredibilityScore": self.issue_credibility_score,
            "riskScore": self.risk_score,
            "developmentPotentialScore": self.development_potential_score,
            "summary": self.summary,
            "topStrengths": self.top_strengths,
            "topWeaknesses": self.top_weaknesses,
            "recommendedActions": self.recommended_actions,
            "evidenceSummary": self.evidence_summary,
            "confidence": self.confidence.value,
        }


@dataclass
class CandidateComparisonResult:
    constituency_entity_id: str
    rows: List[CandidateSeatAssessment]
    strongest: Optional[str] = None
    safest: Optional[str] = None
    most_locally_credible: Optional[str] = None
    most_factionally_acceptable: Optional[str] = None
    highest_risk: Optional[str] = None
    most_developable: Optional[str] = None
    display_names: Dict[str, str] = field(default_factory=dict)

    def to_payload(self) -> Dict[str, Any]:
        raw = {
            "constituencyEntityId": self.constituency_entity_id,
            "rows": [
                {
                    "candidateEntityId": a.candidate_entity_id,
                    "displayName": self.display_names.get(a.candidate_entity_id, ""),
                    "assessment": a.to_payload(),
                }
                for a in self.rows
            ],
            "strongest": self.strongest,
            "safest": self.safest,
            "mostLocallyCredible": self.most_locally_credible,
            "mostFactionallyAcceptable": self.most_factionally_acceptable,
            "highestRisk": self.highest_risk,
            "mostDevelopable": self.most_developable,
        }
        return {k: v for k, v in raw.items() if v is not None}


# --------------------------------------------------------------------------- #
# Faithful port of the ontology's deterministic assessment.
# --------------------------------------------------------------------------- #
def assess_seat_fit(ctx: CandidateSeatContext) -> CandidateSeatAssessment:
    """Reproduce calculateCandidateSeatAssessment exactly (same weights, same
    risk discount, same strengths/weaknesses/actions/confidence)."""
    p = ctx.profile

    readiness = p.overall_readiness_score
    if readiness is None:
        readiness = _avg([p.political_experience_score, p.campaign_capacity_score, p.media_readiness_score], 50.0)
    local_connection = p.local_connection_score if p.local_connection_score is not None else 50.0
    local_association_support = p.local_association_support_score if p.local_association_support_score is not None else 50.0
    media_readiness = p.media_readiness_score if p.media_readiness_score is not None else 50.0
    issue_credibility = p.issue_credibility_score if p.issue_credibility_score is not None else 50.0
    development_potential = p.development_potential_score if p.development_potential_score is not None else 50.0

    # Stakeholder coverage: blend stored score with live coverage if supplied.
    if ctx.live_stakeholder_coverage is not None:
        live = _clamp(float(ctx.live_stakeholder_coverage))
        stakeholder_coverage = _avg([p.stakeholder_strength_score, live], live) if p.stakeholder_strength_score is not None else live
    else:
        stakeholder_coverage = p.stakeholder_strength_score if p.stakeholder_strength_score is not None else 50.0

    # Faction acceptability: stored, else from live faction attitudes, else neutral.
    if p.faction_acceptability_score is not None:
        faction_acceptability = float(p.faction_acceptability_score)
    elif ctx.faction_attitude_scores:
        faction_acceptability = _clamp(_avg(ctx.faction_attitude_scores, 50.0))
    else:
        faction_acceptability = 50.0

    risk_score = p.risk_score if p.risk_score is not None else _clamp(ctx.open_risk_count * 20.0)

    overall_fit = _clamp(
        _weighted_avg([
            (readiness, FIT_WEIGHTS["readiness"]),
            (local_connection, FIT_WEIGHTS["localConnection"]),
            (stakeholder_coverage, FIT_WEIGHTS["stakeholderCoverage"]),
            (local_association_support, FIT_WEIGHTS["localAssociationSupport"]),
            (faction_acceptability, FIT_WEIGHTS["factionAcceptability"]),
            (media_readiness, FIT_WEIGHTS["mediaReadiness"]),
            (issue_credibility, FIT_WEIGHTS["issueCredibility"]),
            (development_potential, FIT_WEIGHTS["developmentPotential"]),
        ]) - risk_score * 0.15
    )

    components = {
        "readiness": readiness,
        "local connection": local_connection,
        "stakeholder coverage": stakeholder_coverage,
        "local association support": local_association_support,
        "faction acceptability": faction_acceptability,
        "media readiness": media_readiness,
        "issue credibility": issue_credibility,
        "development potential": development_potential,
    }
    ordered = sorted(components.items(), key=lambda kv: kv[1], reverse=True)
    top_strengths = [f"{k} ({_round_half_up(v)})" for k, v in ordered[:3] if v >= 55]
    top_weaknesses = [f"{k} ({_round_half_up(v)})" for k, v in ordered[-3:] if v < 50]

    recommended: List[str] = []
    if local_connection < 40:
        recommended.append("Strengthen local links")
    if local_association_support < 40:
        recommended.append("Meet local association leadership")
    if risk_score >= 60:
        recommended.append("Conduct vetting / mitigation")
    if media_readiness < 40:
        recommended.append("Prepare media training")

    confidence = Confidence.MEDIUM if ctx.relationship_count >= 5 else Confidence.LOW

    fit_round = _round_half_up(overall_fit)
    summary = f"Overall fit {fit_round}/100 for the target seat. "
    if top_strengths:
        summary += "Strengths: " + ", ".join(top_strengths) + ". "
    if top_weaknesses:
        summary += "Watch: " + ", ".join(top_weaknesses) + "."
    summary = summary.strip()

    return CandidateSeatAssessment(
        candidate_entity_id=ctx.candidate_entity_id,
        constituency_entity_id=ctx.constituency_entity_id,
        overall_fit_score=fit_round,
        readiness_score=_round_half_up(readiness),
        local_connection_score=_round_half_up(local_connection),
        stakeholder_coverage_score=_round_half_up(stakeholder_coverage),
        local_association_support_score=_round_half_up(local_association_support),
        faction_acceptability_score=_round_half_up(faction_acceptability),
        media_readiness_score=_round_half_up(media_readiness),
        issue_credibility_score=_round_half_up(issue_credibility),
        risk_score=_round_half_up(risk_score),
        development_potential_score=_round_half_up(development_potential),
        summary=summary,
        top_strengths=top_strengths,
        top_weaknesses=top_weaknesses,
        recommended_actions=recommended,
        evidence_summary=(
            f"{ctx.relationship_count} current relationships, "
            f"{ctx.faction_link_count} faction links, {ctx.open_risk_count} open risks considered."
        ),
        confidence=confidence,
    )


# --------------------------------------------------------------------------- #
# Inbound mapping: ontology candidate -> the engine's CandidateProfile.
# --------------------------------------------------------------------------- #
def candidate_profile_to_engine(
    ctx: CandidateSeatContext,
    *,
    party_id: str,
    district_id: str,
    policy_position: Optional[Sequence[float]] = None,
    valence_scale: float = 1.0 / 100.0,
) -> CandidateProfile:
    """Map ontology candidate quality signal onto the engine's CandidateProfile.

    The ontology's 0–100 sub-scores are scaled by ``valence_scale`` (default
    1/100) so they sit on the same magnitude as the engine's spatial utilities.
    The ontology carries **no ideological position**, so ``policy_position`` is
    taken from the context, the argument, or defaults to a neutral zero vector
    (recorded in metadata) — supply a real position for spatial realism.
    """
    p = ctx.profile
    pos = policy_position if policy_position is not None else ctx.policy_position
    neutral = pos is None
    pos = [0.0] if neutral else list(pos)

    s = valence_scale
    valence = {
        "competence": (p.political_experience_score or 0.0) * s,
        "experience": (p.political_experience_score or 0.0) * s,
        "local_visibility": (p.media_readiness_score or 0.0) * s,
        "public_communication": (p.media_readiness_score or 0.0) * s,
        "campaign_capacity": (p.campaign_capacity_score or 0.0) * s,
        "selectorate_support": (p.local_association_support_score or 0.0) * s,
        "incumbency_or_name_recognition": (p.media_readiness_score or 0.0) * s,
    }
    return CandidateProfile(
        candidate_id=ctx.candidate_entity_id,
        display_name=ctx.display_name or ctx.candidate_entity_id,
        party_id=party_id,
        eligible_districts=[district_id],
        policy_position=np.asarray(pos, dtype=float),
        valence=valence,
        local_affinity={district_id: (p.local_connection_score or 0.0) * s},
        selectorate_support={district_id: (p.local_association_support_score or 0.0) / 100.0},
        campaign_capacity={district_id: (p.campaign_capacity_score or 0.0)},
        public_visibility={district_id: (p.media_readiness_score or 0.0)},
        risk_flags={"aggregate_risk": (p.risk_score or 0.0) / 100.0},
        representation_attributes=dict(ctx.representation_attributes),
        metadata={**ctx.metadata, "policy_position_is_neutral_default": neutral},
    )


# --------------------------------------------------------------------------- #
# Comparison: ontology-faithful fit, optional engine electoral overlay.
# --------------------------------------------------------------------------- #
def compare_candidates_for_seat(
    seat_contexts: Sequence[CandidateSeatContext],
    constituency_entity_id: str,
    *,
    engine_report: Optional[CandidateSelectionReport] = None,
) -> CandidateComparisonResult:
    """Build an ontology ``CandidateComparison`` for several candidates.

    Each row's assessment is the ontology-faithful fit (`assess_seat_fit`). If
    an engine report is supplied (the electoral simulation the ontology cannot
    do itself), rows are ordered by the engine's ranking and each summary is
    annotated with the simulated win probability / expected seats; otherwise
    rows are ordered by overall fit. Superlatives come from the fit assessments.
    """
    assessments = {c.candidate_entity_id: assess_seat_fit(c) for c in seat_contexts}
    names = {c.candidate_entity_id: (c.display_name or c.candidate_entity_id) for c in seat_contexts}

    # Optional electoral overlay from the engine report.
    if engine_report is not None:
        order = [s.option_id for s in engine_report.ranked if s.option_id in assessments]
        order += [cid for cid in assessments if cid not in order]
        by_id = {s.option_id: s for s in engine_report.ranked}
        for cid, a in assessments.items():
            s = by_id.get(cid)
            if s is not None:
                pwin = "-" if s.p_target_win != s.p_target_win else f"{s.p_target_win:.2f}"
                a.summary = (a.summary + f" [electoral: P(win)={pwin}, E[seats]={s.expected_seats:.2f}, "
                             f"J={s.J:.3f}, tie-band {s.tie_band}]").strip()
    else:
        order = sorted(assessments, key=lambda cid: assessments[cid].overall_fit_score, reverse=True)

    rows = [assessments[cid] for cid in order]

    def arg(metric, want_max=True):
        if not assessments:
            return None
        return (max if want_max else min)(assessments.items(), key=lambda kv: metric(kv[1]))[0]

    return CandidateComparisonResult(
        constituency_entity_id=constituency_entity_id,
        rows=rows,
        strongest=arg(lambda a: a.overall_fit_score, True),
        safest=arg(lambda a: a.risk_score, False),
        most_locally_credible=arg(lambda a: a.local_connection_score, True),
        most_factionally_acceptable=arg(lambda a: a.faction_acceptability_score, True),
        highest_risk=arg(lambda a: a.risk_score, True),
        most_developable=arg(lambda a: a.development_potential_score, True),
        display_names=names,
    )


# --------------------------------------------------------------------------- #
# Optional REST client for the ontology candidate endpoints (stdlib only).
# --------------------------------------------------------------------------- #
class OntologyCandidateClient(OntologyClient):
    """Adds the ontology's candidate endpoints to the base OntologyClient.

      GET  /api/candidates/{id}/context
      GET  /api/candidates/{id}/seat-assessment/{constituencyId}
      POST /api/candidates/compare
    """

    def get_candidate_seat_context(self, candidate_id: str, constituency_id: str) -> CandidateSeatContext:
        raw = self._request("GET", f"/api/candidates/{candidate_id}/context")
        # /context returns {entity, profile}; fold in the constituency id.
        d = dict(raw or {})
        d["constituencyEntityId"] = constituency_id
        return CandidateSeatContext.from_dict(d)

    def get_seat_assessment(self, candidate_id: str, constituency_id: str) -> Dict[str, Any]:
        """The ontology's own deterministic assessment (server-computed)."""
        return self._request("GET", f"/api/candidates/{candidate_id}/seat-assessment/{constituency_id}")

    def compare_candidates(self, candidate_ids: List[str], constituency_id: str) -> Dict[str, Any]:
        return self._request("POST", "/api/candidates/compare",
                             {"candidateIds": candidate_ids, "constituencyId": constituency_id})
