"""
neural_signal.py — Neural Signal Layer v0 (deterministic demo placeholder).

THIS IS NOT A NEURAL NETWORK. It is a rule/weighted scoring model that
implements the SAME input/output contract the future trained model will use:

    context packet (candidate + seat + signals + relationships + risks
                    + events + memory records)
        -> {candidateStrength, localFit, mediaRisk, factionRisk,
            stakeholderSupport, performanceDelta, confidence, modelVersion}

FUTURE SWAP POINT
-----------------
`score_context()` is the single function to replace when the trained
black-box model exists (multimodal embeddings + tabular constituency model
+ relationship graph features + prediction heads). Callers must not depend
on anything except this signature and the returned keys. Bump modelVersion
when the trained model lands (e.g. "neural-signal-v1").

Everything here is deterministic: same context in, same scores out.
"""
from __future__ import annotations

from typing import Dict, List

MODEL_VERSION = "neural-signal-v0-demo"

_SEVERITY = {"low": 0.3, "medium": 0.6, "high": 0.9}
_STANCE = {"supportive": 1.0, "neutral": 0.5, "hostile": 0.0}


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _signal_net(signals: List[Dict]) -> float:
    """Mean of direction*magnitude over signals, mapped from [-1, 1] to [0, 1]."""
    if not signals:
        return 0.5
    net = sum(s.get("direction", 0) * s.get("magnitude", 0.0) for s in signals) / len(signals)
    return _clip01(0.5 + net / 2.0)


def _risk_load(risks: List[Dict], categories: set) -> float:
    """0..1 load from open risks in the given categories."""
    sel = [r for r in risks if r.get("category") in categories and r.get("status", "open") == "open"]
    if not sel:
        return 0.0
    return _clip01(sum(_SEVERITY.get(r.get("severity", "medium"), 0.6) for r in sel) / max(len(sel), 1)
                   * min(1.0, 0.6 + 0.2 * len(sel)))


def _stakeholder_support(relationships: List[Dict]) -> float:
    """Influence-weighted mean stance; 0.5 when no relationship data."""
    if not relationships:
        return 0.5
    wsum = sum(r.get("strength", 0.5) for r in relationships)
    if wsum <= 0:
        return 0.5
    return _clip01(sum(_STANCE.get(r.get("stance", "neutral"), 0.5) * r.get("strength", 0.5)
                       for r in relationships) / wsum)


def score_context(context: Dict) -> Dict:
    """Neural Signal Layer v0: deterministic placeholder scoring.

    FUTURE SWAP POINT: replace this body with a call into the trained
    black-box neural model. Keep the signature and output keys identical.
    """
    candidate = context.get("candidate", {})
    seat = context.get("seat", {})
    attrs = candidate.get("attributes", {})
    signals = context.get("relevantSignals", [])
    relationships = context.get("relationships", [])
    risks = context.get("risks", [])

    seat_code = seat.get("code", "")
    fit_prior = candidate.get("seatFit", {}).get(seat_code, 0.5)

    cand_signals = [s for s in signals if s.get("candidateId") == candidate.get("id")]
    seat_signals = [s for s in signals if s.get("candidateId") is None]
    negative_media = [s for s in cand_signals
                      if s.get("direction", 0) < 0 and s.get("topic") in ("media", "stakeholders")]

    # Issue alignment: candidate credibility on the seat's key issues.
    cred = candidate.get("issueCredibility", {})
    key_issues = seat.get("keyIssues", [])
    issue_alignment = (sum(cred.get(i, 0.4) for i in key_issues) / len(key_issues)) if key_issues else 0.5

    stakeholder_support = _stakeholder_support(relationships)

    candidate_strength = _clip01(
        0.50 * attrs.get("baseStrength", 0.5)
        + 0.20 * fit_prior
        + 0.30 * _signal_net(cand_signals)
    )
    local_fit = _clip01(
        0.45 * fit_prior
        + 0.25 * issue_alignment
        + 0.15 * stakeholder_support
        + 0.15 * _signal_net(seat_signals)
    )
    media_risk = _clip01(
        0.45 * attrs.get("mediaExposure", 0.5)
        + 0.35 * _risk_load(risks, {"media"})
        + 0.20 * min(1.0, 0.4 * len(negative_media))
    )
    faction_risk = _clip01(
        0.50 * attrs.get("factionTension", 0.5)
        + 0.50 * _risk_load(risks, {"faction"})
    )

    # Expected over/under-performance vs party baseline, in vote-share points.
    performance_delta = round(
        8.0 * (candidate_strength - 0.5)
        + 4.0 * (local_fit - 0.5)
        - 3.0 * max(0.0, media_risk - 0.5)
        - 2.0 * max(0.0, faction_risk - 0.5),
        2,
    )

    # Confidence from evidence volume (demo heuristic; the trained model will
    # emit calibrated uncertainty instead).
    n_records = (len(signals) + len(relationships) + len(risks)
                 + len(context.get("recentEvents", [])) + len(context.get("memoryRecords", [])))
    confidence = "low" if n_records < 5 else ("medium" if n_records < 12 else "high")

    return {
        "candidateStrength": round(candidate_strength, 3),
        "localFit": round(local_fit, 3),
        "mediaRisk": round(media_risk, 3),
        "factionRisk": round(faction_risk, 3),
        "stakeholderSupport": round(stakeholder_support, 3),
        "performanceDelta": performance_delta,
        "confidence": confidence,
        "modelVersion": MODEL_VERSION,
    }
