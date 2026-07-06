"""
demo_router.py — Arcet Signal Demo endpoints for Arrow.

Demonstrates the full Arcet loop on seeded demo data, with no LLM calls,
no database, and no platform backend:

    GET  /demo/context           stored demo context packet
    POST /demo/neural-signal/score   Neural Signal Layer v0 scores
    POST /demo/run-scenario      context -> scores -> FPTPContext ->
                                 existing assess_constituency() Monte Carlo ->
                                 normalized recommendation
    GET  /demo/options           dropdown values for a future frontend panel

Everything is deterministic (fixed seeds derived from the request) and all
data is labelled realOrDemo: "demo". The simulation itself is the existing
fptp_strategy_model engine — nothing here reimplements it.
"""
from __future__ import annotations

import copy
import zlib
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from fptp_strategy_model import (
    Confidence,
    FPTPContext,
    FPTPScenarioType,
    assess_constituency,
)

import demo_store
from demo_store import build_context
from neural_signal import MODEL_VERSION, score_context

router = APIRouter(prefix="/demo", tags=["demo"])

ENGINE_VERSION = "arrow-fptp-monte-carlo"
N_SIMULATIONS = 600

# Optional HoC GE2024 registry (set by server.py at startup). When present,
# real vote shares replace the seeded election history.
_REGISTRY = None


def configure(registry=None) -> None:
    global _REGISTRY
    _REGISTRY = registry


# ── Request models ────────────────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    candidateId: str
    seatCode: str
    context: Optional[Dict[str, Any]] = None  # optional pre-fetched packet


class ScenarioRequest(BaseModel):
    candidateId: str
    seatCode: str
    scenario: str


# ── Scenario vocabulary ───────────────────────────────────────────────────────

_SCENARIO_ALIASES = {
    "run_hard": FPTPScenarioType.RUN_HARD,
    "run_soft": FPTPScenarioType.RUN_SOFT,
    "stand_aside": FPTPScenarioType.STAND_ASIDE,
    "change_candidate": FPTPScenarioType.CHANGE_CANDIDATE,
    "invest_more": FPTPScenarioType.INCREASE_RESOURCES,
    "increase_resources": FPTPScenarioType.INCREASE_RESOURCES,
    "decrease_resources": FPTPScenarioType.DECREASE_RESOURCES,
    "gather_more_data": FPTPScenarioType.GATHER_MORE_DATA,
}

_LABEL_HUMAN = {
    "COMPETE_HARD": "Compete hard",
    "COMPETE_SELECTIVELY": "Compete selectively",
    "SYMBOLIC_RUN": "Symbolic run — build for the next election",
    "STAND_ASIDE": "Stand aside",
    "DO_NOT_INVEST": "Do not invest",
    "CHANGE_CANDIDATE": "Change candidate",
    "GATHER_MORE_DATA": "Gather more data",
    "ESCALATE_TO_STRATEGIST": "Escalate to strategist",
}

_CONF_ORDER = {"low": 0, "medium": 1, "high": 2}


def _parse_scenario(raw: str) -> FPTPScenarioType:
    key = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    scenario = _SCENARIO_ALIASES.get(key)
    if scenario is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario {raw!r}. Valid: {sorted(_SCENARIO_ALIASES)}",
        )
    return scenario


def _get_context(candidate_id: str, seat_code: str) -> Dict:
    try:
        return build_context(candidate_id, seat_code)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Election history (real registry shares when available) ────────────────────

def _election_history(seat: Dict) -> tuple[List[Dict], str]:
    """Return (history rows, source). Prefers real HoC GE2024 shares."""
    if _REGISTRY is not None:
        info = _REGISTRY.get(seat["code"])
        if info is not None and info.vote_shares:
            try:
                from blocs import normalise_party
                agg: Dict[str, float] = {}
                for party_raw, share in info.vote_shares.items():
                    key = normalise_party(party_raw)
                    agg[key] = agg.get(key, 0.0) + share
                rows = [
                    {"electionDate": "2024-07-04", "partyEntityId": p,
                     "voteShare": round(s, 4), "position": i + 1}
                    for i, (p, s) in enumerate(sorted(agg.items(), key=lambda x: -x[1]))
                ]
                return rows, "hoc_ge2024_registry"
            except Exception:
                pass
    return [dict(r) for r in seat["electionHistory"]], "seeded_demo_history"


# ── Scores -> FPTPContext mapping ─────────────────────────────────────────────

def _fptp_payload(context: Dict, scores: Dict, history: List[Dict]) -> Dict:
    """Map demo context + Neural Signal scores into the FPTPContext contract
    that the existing ontology/simulation path already understands."""
    seat = context["seat"]
    cand = context["candidate"]
    risk_score = max(scores["mediaRisk"], scores["factionRisk"]) * 100.0
    return {
        "constituencyEntityId": seat["code"],
        "candidateEntityId": cand["id"],
        "electionHistory": history,
        "seatAssessment": {
            "overallFitScore": scores["localFit"] * 100.0,
            "readinessScore": scores["candidateStrength"] * 100.0,
            "localConnectionScore": scores["localFit"] * 100.0,
            "riskScore": risk_score,
            "developmentPotentialScore": float(seat["developmentPotential"]),
        },
        "localPartyStrength": round(1.0 + scores["stakeholderSupport"] * 4.0, 2),  # 1..5
        "stakeholderCoverageScore": scores["stakeholderSupport"] * 100.0,
        "issueVolatility": seat["issueVolatility"],
        "tacticalVotingRisk": seat["tacticalVotingRisk"],
        "spoilerRisk": seat["spoilerRisk"],
        "targetStatus": seat["targetStatus"],
        "strategicPriority": seat["strategicPriority"],
    }


def _apply_scenario(payload: Dict, scores: Dict, scenario: FPTPScenarioType,
                    candidate_party: str) -> tuple[Dict, Dict, float, List[str]]:
    """Deterministic scenario levers applied BEFORE simulation.
    Returns (payload, scores, fit_valence_strength, notes)."""
    payload = copy.deepcopy(payload)
    scores = dict(scores)
    fit_valence = 1.5  # engine default
    notes: List[str] = []

    def bump(key: str, delta: float, lo: float = 0.0, hi: float = 100.0):
        payload["seatAssessment"][key] = max(lo, min(hi, payload["seatAssessment"][key] + delta))

    if scenario is FPTPScenarioType.RUN_HARD:
        payload["stakeholderCoverageScore"] = min(100.0, payload["stakeholderCoverageScore"] + 10.0)
        bump("readinessScore", 8.0)
        fit_valence = 2.0
        notes.append("Scenario lever: full-intensity campaign — readiness and stakeholder coverage raised.")
    elif scenario is FPTPScenarioType.INCREASE_RESOURCES:
        payload["stakeholderCoverageScore"] = min(100.0, payload["stakeholderCoverageScore"] + 15.0)
        bump("readinessScore", 10.0)
        fit_valence = 1.8
        notes.append("Scenario lever: additional resources — readiness and stakeholder coverage raised.")
    elif scenario is FPTPScenarioType.DECREASE_RESOURCES:
        payload["stakeholderCoverageScore"] = max(0.0, payload["stakeholderCoverageScore"] - 10.0)
        bump("readinessScore", -10.0)
        fit_valence = 1.2
        notes.append("Scenario lever: reduced resources — readiness and stakeholder coverage lowered.")
    elif scenario is FPTPScenarioType.STAND_ASIDE:
        for row in payload["electionHistory"]:
            if row.get("partyEntityId") == candidate_party:
                row["voteShare"] = round(row["voteShare"] * 0.05, 4)
        notes.append("Scenario lever: stand aside — candidate's party share collapsed; "
                     "remaining blocs renormalised by the engine.")
    elif scenario is FPTPScenarioType.CHANGE_CANDIDATE:
        # Neutral replacement-candidate profile (unknown quantity).
        scores.update({"candidateStrength": 0.55, "localFit": 0.50, "mediaRisk": 0.30,
                       "factionRisk": 0.45, "stakeholderSupport": 0.50, "performanceDelta": 0.0})
        payload["seatAssessment"].update({
            "overallFitScore": 50.0, "readinessScore": 55.0, "localConnectionScore": 50.0,
            "riskScore": 45.0,
        })
        payload["localPartyStrength"] = 3.0
        payload["stakeholderCoverageScore"] = 50.0
        notes.append("Scenario lever: change candidate — simulated with a neutral replacement profile.")
    elif scenario is FPTPScenarioType.GATHER_MORE_DATA:
        notes.append("Scenario lever: gather more data — baseline simulation; confidence capped at low.")
    # RUN_SOFT is the unmodified baseline.

    return payload, scores, fit_valence, notes


# ── Output normalisation helpers ──────────────────────────────────────────────

def _risk_level(scores: Dict, win_prob: float) -> str:
    uncertainty = 1.0 - abs(win_prob - 0.5) * 2.0  # 1 at 50/50, 0 at certainty
    composite = (0.45 * max(scores["mediaRisk"], scores["factionRisk"])
                 + 0.30 * (1.0 - scores["stakeholderSupport"])
                 + 0.25 * uncertainty)
    return "low" if composite < 0.35 else ("medium" if composite < 0.60 else "high")


def _next_action(context: Dict, scores: Dict, scenario: FPTPScenarioType) -> str:
    if scenario is FPTPScenarioType.STAND_ASIDE:
        return "Confirm stand-aside coordination terms and messaging with the beneficiary party."
    if scenario is FPTPScenarioType.GATHER_MORE_DATA:
        return "Commission a constituency poll to reduce uncertainty before committing resources."
    if scores["stakeholderSupport"] < 0.55:
        targets = [r["entity"] for r in context["relationships"] if r["stance"] != "supportive"]
        who = targets[0] if targets else "key local stakeholders"
        return f"Meet {who} before increasing spend — stakeholder support is the weakest signal."
    if scores["mediaRisk"] >= 0.5:
        return "Prepare a media response plan for the open press risk before the next campaign phase."
    if scores["factionRisk"] >= 0.5:
        return "Convene local branch mediation to settle internal splits before scaling activity."
    if scores["localFit"] < 0.5:
        return "Run listening events on the seat's key issues to build the candidate's local footprint."
    return "Proceed to a targeted ground campaign in the most persuadable wards."


def _combined_confidence(neural: str, engine: Confidence) -> str:
    engine_key = {"LOW": "low", "MEDIUM": "medium", "HIGH": "high", "CONFIRMED": "high"}.get(
        engine.value if engine else "MEDIUM", "medium")
    return min(neural, engine_key, key=lambda c: _CONF_ORDER.get(c, 1))


def _build_why(context: Dict, scores: Dict, rationale: str,
               scenario: FPTPScenarioType, engine_scenario: str,
               notes: List[str]) -> List[str]:
    why: List[str] = [rationale]

    cand_id = context["candidate"]["id"]
    cand_signals = [s for s in context["relevantSignals"] if s.get("candidateId") == cand_id]
    positives = sorted((s for s in cand_signals if s["direction"] > 0),
                       key=lambda s: -s["magnitude"])
    if positives:
        why.append(f"Strongest stored signal: {positives[0]['summary']}")

    dims = {"candidate strength": scores["candidateStrength"],
            "local fit": scores["localFit"],
            "stakeholder support": scores["stakeholderSupport"]}
    weakest = min(dims, key=dims.get)
    why.append(f"Weakest signal dimension: {weakest} ({dims[weakest]:.2f}).")

    open_risks = [r for r in context["risks"] if r.get("status", "open") == "open"]
    if open_risks:
        why.append(f"Top open risk: {open_risks[0]['summary']}")

    if scenario.value != engine_scenario:
        why.append(f"Requested scenario '{scenario.value}' differs from the engine's preferred "
                   f"scenario '{engine_scenario}'.")
    why.extend(notes)
    return why


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/context")
def demo_context(candidateId: str, seatCode: str):
    """Stored demo context packet for one candidate + seat. No LLM, no DB."""
    return _get_context(candidateId, seatCode)


@router.post("/neural-signal/score")
def demo_neural_signal_score(req: ScoreRequest):
    """Neural Signal Layer v0 scores (deterministic placeholder, not a real NN)."""
    context = req.context or _get_context(req.candidateId, req.seatCode)
    return score_context(context)


@router.get("/options")
def demo_options():
    """Dropdown values for a future frontend scenario panel."""
    return {
        "candidates": [{"id": c["id"], "name": c["name"], "party": c["party"]}
                       for c in demo_store.CANDIDATES.values()],
        "seats": [{"code": s["code"], "name": s["name"]} for s in demo_store.SEATS.values()],
        "scenarios": sorted({v.value.lower() for v in _SCENARIO_ALIASES.values()}),
        "realOrDemo": demo_store.DEMO_FLAG,
    }


@router.post("/run-scenario")
def demo_run_scenario(req: ScenarioRequest):
    """Full demo loop: stored context -> Neural Signal v0 -> existing FPTP
    Monte Carlo (assess_constituency) -> normalized recommendation."""
    scenario = _parse_scenario(req.scenario)
    context = _get_context(req.candidateId, req.seatCode)
    candidate = context["candidate"]
    seat = context["seat"]

    # 1. Score the stored context through Neural Signal Layer v0.
    scores = score_context(context)

    # 2. Map scores into the engine's FPTPContext contract and apply the
    #    requested scenario's deterministic levers.
    history, history_source = _election_history(seat)
    payload = _fptp_payload(context, scores, history)
    payload, sim_scores, fit_valence, scenario_notes = _apply_scenario(
        payload, scores, scenario, candidate["party"])

    # 3. Run the EXISTING Monte Carlo assessment (fptp_strategy_model.ontology).
    #    Seed derives from the request so results are stable across runs.
    seed = zlib.crc32(f"{candidate['id']}|{seat['code']}|{scenario.value}".encode()) % 100_000
    ctx = FPTPContext.from_dict(payload)
    try:
        assessment = assess_constituency(
            ctx,
            candidate_party=candidate["party"],
            n_simulations=N_SIMULATIONS,
            seed=seed,
            district_kwargs={"fit_valence_strength": fit_valence},
            title=f"Arcet demo: {candidate['name']} / {seat['name']} / {scenario.value}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {e}")

    si = assessment.scenario_input
    label = si.recommendation_label.value if si.recommendation_label else "GATHER_MORE_DATA"
    engine_scenario = si.scenario_type.value if si.scenario_type else "GATHER_MORE_DATA"
    low, _mid, high = assessment.vote_share_band  # 0..100

    confidence = _combined_confidence(scores["confidence"], si.confidence)
    if scenario is FPTPScenarioType.GATHER_MORE_DATA:
        confidence = "low"

    # 4. Normalize for the frontend adapter (raw engine shapes stay internal).
    return {
        "recommendation": _LABEL_HUMAN.get(label, label),
        "recommendationLabel": label,
        "winProbability": round(assessment.win_probability, 3),
        "expectedVoteShareRange": [round(low / 100.0, 3), round(high / 100.0, 3)],
        "riskLevel": _risk_level(sim_scores, assessment.win_probability),
        "why": _build_why(context, scores, si.rationale or "", scenario,
                          engine_scenario, scenario_notes),
        "nextAction": _next_action(context, scores, scenario),
        "confidence": confidence,
        "contextUsed": {
            "candidate": {"id": candidate["id"], "name": candidate["name"], "party": candidate["party"]},
            "seat": {"code": seat["code"], "name": seat["name"]},
            "signals": len(context["relevantSignals"]),
            "relationships": len(context["relationships"]),
            "risks": len(context["risks"]),
            "recentEvents": len(context["recentEvents"]),
            "memoryRecords": len(context["memoryRecords"]),
            "electionHistorySource": history_source,
            "warnings": context["warnings"],
        },
        "scores": scores,
        "arrowInputs": {
            "fptpContext": payload,
            "candidateParty": candidate["party"],
            "nSimulations": N_SIMULATIONS,
            "seed": seed,
            "fitValenceStrength": fit_valence,
        },
        "scenarioRequested": scenario.value,
        "engineScenario": engine_scenario,
        "modelVersion": MODEL_VERSION,
        "engine": ENGINE_VERSION,
        "realOrDemo": demo_store.DEMO_FLAG,
    }
