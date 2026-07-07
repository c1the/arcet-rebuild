"""
server.py — Arrow FastAPI backend

POST /chat   { message, history, config } → { reply, patch, config }
POST /run    { config }                   → { results }
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fptp_strategy_model import (
    Action, Bloc, DistrictData, ElectionConfig,
    ObjectiveWeights, RiskConfig, StrategyModel,
)
from blocs import build_blocs, infer_party_map, normalise_party
from ons_loader import load_ons_features

logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Lazy Anthropic client: only /chat needs it. Arrow must start (and the
# deterministic /run, /constituencies and /demo/* endpoints must work)
# without ANTHROPIC_API_KEY being set.
_client: Optional[anthropic.Anthropic] = None

def _get_anthropic_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="ANTHROPIC_API_KEY is not set — /chat is unavailable. "
                       "All other endpoints (including /demo/*) work without it.",
            )
        _client = anthropic.Anthropic(api_key=api_key)
    return _client

# ── Load public data once at startup ─────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_DATA_ROOT = _PROJECT_ROOT / "data"

_HOC_PATH = os.environ.get(
    "ARROW_HOC_PATH",
    str(_DATA_ROOT / "HoC-GE2024-results-by-constituency.xlsx"),
)
_ONS_PATH = os.environ.get(
    "ARROW_ONS_PATH",
    str(_DATA_ROOT / "ons_qualifications.csv"),
)

try:
    from district_adapter import load_hoc_results, compose_district_data
    _registry = load_hoc_results(_HOC_PATH)
    logger.info("HoC registry loaded: %d constituencies", len(_registry))
except Exception as _e:
    logger.warning("HoC registry load failed: %s", _e)
    _registry = None

try:
    _ons = load_ons_features(_ONS_PATH)
    logger.info("ONS features loaded: %d constituencies", len(_ons))
except Exception as _e:
    logger.warning("ONS features load failed: %s", _e)
    _ons = {}

# ── Arcet Signal Demo (seeded data, deterministic, no LLM) ───────────────────

import demo_router as _demo_router
_demo_router.configure(registry=_registry)
app.include_router(_demo_router.router)

# ── Data models ───────────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []
    config: Dict[str, Any] = {}

class ChatResponse(BaseModel):
    reply: str
    patch: Optional[Dict[str, Any]] = None
    config: Dict[str, Any] = {}

class RunRequest(BaseModel):
    config: Dict[str, Any]

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM = """
You are Arrow, a political strategy assistant for first-past-the-post elections.
You help users think through campaign strategy by collecting information and running a simulation.

You maintain a config JSON that drives the simulation. When the user provides information,
you propose updates to the config as a JSON patch.

CONFIG STRUCTURE:
{
  "actor": {
    "name": null,          // candidate or party name
    "districts": [],       // list of constituency names/codes
    "leaning": null        // political leaning e.g. "centre-left"
  },
  "objective": null,       // "seats" | "majority" | "policy" | "vote_share"
  "risk": null,            // "low" | "medium" | "high"
  "actions": [             // defaults to all allowed
    "status_quo", "allocate", "reposition", "mobilise", "release_info", "withdraw"
  ],
  "private_overrides": {}  // anything the user tells you that overrides public data
}

PARAMETER LABELS:
- Public: fetched automatically — never ask the user
- Private: must come from user — actor, objective, risk, actions, any local knowledge
- BlackBox: bloc regression output — never ask
- HardCode: fixed defaults — never ask

QUESTION ORDER (when params are missing):
1. Actor (who they are, which districts)
2. Objective (what they want to achieve)
3. Risk appetite
4. Actions (default all, ask if they want to remove any)

RULES:
- Do NOT suggest running or interpret results until actor (name + districts), objective, risk, and actions are ALL set. Keep asking one question at a time until all four are filled.
- If the user volunteers information (e.g. "locals told me X") → capture in private_overrides
- Private overrides take priority over everything else
- Ask one question at a time
- Be concise — this is a strategy tool, not a chatbot

RESPONSE FORMAT:
Always respond with valid JSON:
{
  "reply": "your conversational response to the user",
  "patch": { ...config fields to update... } or null if no update
}
"""

# ── Patch validator ───────────────────────────────────────────────────────────

VALID_OBJECTIVES   = {"seats", "majority", "policy", "vote_share"}
VALID_RISKS        = {"low", "medium", "high"}
VALID_ACTION_TYPES = {
    "status_quo", "allocate", "reposition", "mobilise",
    "release_info", "withdraw", "endorse",
}
VALID_TOP_KEYS = {"actor", "objective", "risk", "actions", "private_overrides"}

def validate_patch(patch: Dict) -> Optional[str]:
    for key in patch:
        if key not in VALID_TOP_KEYS:
            return f"Unknown config key: {key}"
    if "actor" in patch:
        a = patch["actor"]
        if not isinstance(a, dict):
            return "actor must be an object"
        for k in a:
            if k not in {"name", "districts", "leaning"}:
                return f"Unknown actor field: {k}"
        if "districts" in a and not isinstance(a["districts"], list):
            return "actor.districts must be a list"
    if "objective" in patch and patch["objective"] is not None:
        if patch["objective"] not in VALID_OBJECTIVES:
            return f"objective must be one of {sorted(VALID_OBJECTIVES)}"
    if "risk" in patch and patch["risk"] is not None:
        if patch["risk"] not in VALID_RISKS:
            return f"risk must be one of {sorted(VALID_RISKS)}"
    if "actions" in patch:
        if not isinstance(patch["actions"], list):
            return "actions must be a list"
        bad = set(patch["actions"]) - VALID_ACTION_TYPES
        if bad:
            return f"Invalid action types: {sorted(bad)}"
    return None

# ── District composition ──────────────────────────────────────────────────────

def _compose_districts(config: Dict) -> tuple[List[DistrictData], List[str]]:
    """
    Build DistrictData list from real HoC + ONS data.
    Returns (districts, candidates) — candidates derived from first real district.
    Falls back to stub if registry unavailable or district not found.
    """
    actor       = config.get("actor", {}).get("name") or "ACTOR"
    actor_party = normalise_party(actor)
    raw_ids     = config.get("actor", {}).get("districts") or []
    dist_ids    = [str(d) for d in raw_ids[:10]] or ["D1"]

    districts:  List[DistrictData] = []
    candidates: List[str] = [actor, "OPP_A", "OPP_B"]  # default; overwritten on first real hit

    for did in dist_ids:
        info = None
        if _registry is not None:
            info = _registry.find(did)

        if info is None:
            districts.append(_stub_one(did, actor))
            continue

        ons_feats = _ons.get(info.ons_code)

        cands, party_map = infer_party_map(
            actor_id=actor,
            actor_party=actor_party,
            vote_shares=info.vote_shares,
            n_opponents=2,
        )

        # Use the first real district's candidate list for ElectionConfig
        if candidates == [actor, "OPP_A", "OPP_B"]:
            candidates = cands

        try:
            blocs = build_blocs(
                vote_shares=info.vote_shares,
                candidates=cands,
                party_map=party_map,
                ons_features=ons_feats,
            )
        except Exception as e:
            logger.warning("build_blocs failed for %s: %s — using stub", did, e)
            districts.append(_stub_one(did, actor))
            continue

        districts.append(compose_district_data(info, blocs))

    return districts, candidates


def _stub_one(did: str, actor: str) -> DistrictData:
    blocs = [
        Bloc(size=0.40, utility={actor: 5, "OPP_A": 1, "OPP_B": 0}, expressive_cost=0.5, info_level=0.8),
        Bloc(size=0.35, utility={actor: 2, "OPP_A": 5, "OPP_B": 1}, expressive_cost=0.4, info_level=0.9),
        Bloc(size=0.25, utility={actor: 0, "OPP_A": 2, "OPP_B": 5}, expressive_cost=0.5, info_level=0.8),
    ]
    return DistrictData(district_id=did, electorate=70_000, turnout=0.66, blocs=blocs)

# ── Pipeline helpers ──────────────────────────────────────────────────────────

def _objective(config: Dict) -> ObjectiveWeights:
    obj = config.get("objective")
    if obj == "majority":   return ObjectiveWeights(w_majority=1.0)
    if obj == "vote_share": return ObjectiveWeights(w_vote=1.0)
    return ObjectiveWeights(w_seats=1.0)

def _risk(config: Dict) -> RiskConfig:
    r = config.get("risk")
    if r == "low":  return RiskConfig(lambda_risk=0.5, metric="cvar")
    if r == "high": return RiskConfig(lambda_risk=0.0, metric="std")
    return RiskConfig(lambda_risk=0.3, metric="std")

def _build_actions(config: Dict, districts: List[DistrictData], actor: str) -> List[Action]:
    allowed = set(config.get("actions") or list(VALID_ACTION_TYPES))
    dids    = [d.district_id for d in districts]
    actions = []
    if "status_quo"   in allowed: actions.append(Action("status_quo",  actor, label="status_quo"))
    if "allocate"     in allowed: actions.append(Action("allocate",    actor, params={"effort": {d: 8.0  for d in dids}}, action_cost=0.10, label="allocate→marginals"))
    if "mobilise"     in allowed: actions.append(Action("mobilise",    actor, params={"effort": {d: 10.0 for d in dids}}, action_cost=0.08, label="mobilise→marginals"))
    if "reposition"   in allowed: actions.append(Action("reposition",  actor, params={"gain": 0.30, "base_cost": 0.25}, reputational_cost=0.15, label="reposition→centre"))
    if "release_info" in allowed: actions.append(Action("release_info",actor, params={"sigma_factor": 0.5}, action_cost=0.03, label="publish_viability_poll"))
    return actions

def _to_frontend(result: Dict, config: Dict, n_districts: int) -> Dict:
    actor    = config.get("actor", {}).get("name") or "ACTOR"
    decision = result["decision"]
    decomp   = result["decomposition"]
    gate = {
        "clear":       decision.clear_best,
        "recommended": decision.recommended.action.label if decision.recommended else None,
        "gap":         round(decision.payoff_gap, 4),
        "kappa":       decision.kappa,
    }
    actions = [{"label": s.action.label, "J": round(s.J, 4)} for s in decision.ranked]
    candidates    = [actor]
    decomposition = []
    if decomp:
        candidates = list(decomp.action_seats.keys())
        decomposition = [
            {"label": "baseline sincere",       "seats": decomp.baseline_sincere_seats},
            {"label": "after strategic voting", "seats": decomp.strategic_seats},
            {"label": "after action",           "seats": decomp.action_seats},
        ]
    sensitivity = [
        {"scenario": s["scenario"], "top": s["top"], "gap": round(min(s["gap"], 99.0), 4), "clear": s["clear_best"]}
        for s in result["sensitivity"]
    ]
    return {
        "actor": actor, "candidates": candidates, "total_seats": n_districts,
        "gate": gate, "actions": actions, "decomposition": decomposition, "sensitivity": sensitivity,
    }

# ── Helpers ───────────────────────────────────────────────────────────────────

def apply_patch(config: Dict, patch: Dict) -> Dict:
    updated = dict(config)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(updated.get(key), dict):
            updated[key] = {**updated[key], **value}
        else:
            updated[key] = value
    return updated

def parse_llm_response(text: str) -> tuple[str, Optional[Dict]]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(l for l in lines if not l.strip().startswith("```")).strip()
    try:
        data = json.loads(cleaned)
        return data.get("reply", text), data.get("patch")
    except json.JSONDecodeError:
        return text, None

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": f"Current config: {json.dumps(req.config)}\n\nUser: {req.message}"})
    try:
        response = _get_anthropic_client().messages.create(model="claude-sonnet-4-6", max_tokens=1000, system=SYSTEM, messages=messages)
    except HTTPException:
        raise  # e.g. 503 when ANTHROPIC_API_KEY is not set
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    raw = response.content[0].text
    reply, patch = parse_llm_response(raw)
    if patch:
        err = validate_patch(patch)
        if err:
            patch = None
    updated_config = apply_patch(req.config, patch) if patch else req.config
    return ChatResponse(reply=reply, patch=patch, config=updated_config)


@app.post("/run")
async def run(req: RunRequest):
    config = req.config
    actor  = config.get("actor", {}).get("name") or config.get("actor", {}).get("leaning") or "Actor"

    districts, candidates = _compose_districts(config)
    n_districts = len(districts)
    majority    = n_districts // 2 + 1

    allowed_types = [t for t in (config.get("actions") or list(VALID_ACTION_TYPES)) if t in VALID_ACTION_TYPES] or ["status_quo"]

    election_cfg = ElectionConfig(
        candidate_ids=candidates,
        governing_threshold=majority,
        allowed_action_types=allowed_types,
    )

    model   = StrategyModel(config=election_cfg, districts=districts)
    actions = _build_actions(config, districts, actor)
    weights = _objective(config)
    risk    = _risk(config)

    try:
        result = model.recommend(actions, actor=actor, weights=weights, risk=risk, kappa=0.05, n_simulations=400, seed=0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    return _to_frontend(result, config, n_districts)


@app.get("/constituencies")
def constituencies_list(limit: int = 30, marginals_only: bool = False):
    """Return constituency data from HoC GE2024 registry, sorted by smallest majority."""
    if _registry is None:
        return []
    seats = list(_registry.values())
    if marginals_only:
        seats = [s for s in seats if s.is_marginal]
    seats.sort(key=lambda s: s.majority_pct)
    seats = seats[:limit]
    return [
        {
            "ons_code":     s.ons_code,
            "name":         s.name,
            "region":       s.region,
            "country":      s.country,
            "winner":       s.winner,
            "electorate":   s.electorate,
            "turnout":      round(s.turnout * 100, 1),
            "majority":     s.majority,
            "majority_pct": round(s.majority_pct * 100, 1),
            "vote_shares":  {k: round(v * 100, 1) for k, v in sorted(s.vote_shares.items(), key=lambda x: -x[1])[:5]},
        }
        for s in seats
    ]


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
