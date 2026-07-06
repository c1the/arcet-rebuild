#Human-readable report 

from __future__ import annotations

from typing import Dict

from .decision import Decision
from .explainer import Decomposition
from .payoff import ObjectiveWeights


def _weights_str(w: ObjectiveWeights) -> str:
    parts = []
    for name in ("w_win", "w_seats", "w_majority", "w_policy", "w_vote"):
        v = getattr(w, name)
        if v:
            parts.append(f"{name}={v:g}")
    if w.target_seat:
        parts.append(f"target_seat={w.target_seat}")
    return ", ".join(parts) if parts else "(all zero)"


def format_report(result: Dict, actor: str) -> str:
    decision: Decision = result["decision"]
    decomposition: Decomposition | None = result["decomposition"]
    weights: ObjectiveWeights = result["weights"]
    lines = []
    lines.append("=" * 70)
    lines.append(f"FPTP STRATEGY MODEL  --  recommendation for actor: {actor}")
    lines.append("=" * 70)
    lines.append(f"Objective weights : {_weights_str(weights)}")
    lines.append(f"Feasible actions  : {[a.label for a in result['feasible_actions']]}")
    lines.append("")
    lines.append("Ranked actions (by risk-adjusted expected payoff J):")
    lines.append(
        f"  {'action':<28}{'J':>9}{'E[U]':>9}{'sd':>8}"
        f"{'E[seats]':>10}{'P(win)':>9}{'P(maj)':>9}"
    )
    for s in decision.ranked:
        pwin = "-" if s.p_win_target != s.p_win_target else f"{s.p_win_target:.2f}"
        pmaj = "-" if s.p_majority != s.p_majority else f"{s.p_majority:.2f}"
        lines.append(
            f"  {s.action.label:<28}{s.J:>9.3f}{s.mean_utility:>9.3f}"
            f"{s.std_utility:>8.3f}{s.expected_seats:>10.2f}{pwin:>9}{pmaj:>9}"
        )
    lines.append("")
    lines.append(f"Decision : {decision.message}")
    lines.append(f"Payoff gap (top - runner-up): {decision.payoff_gap:.4f}  (kappa={decision.kappa:g})")
    if any(s.n_nonconverged for s in decision.ranked):
        lines.append("  ! Some districts did not reach a strategic-voting fixed point; "
                     "interpret those with caution.")

    if decomposition is not None:
        lines.append("")
        lines.append("Decomposition (mean state, seats for actor and others):")
        for label, seats in (
            ("baseline_sincere", decomposition.baseline_sincere_seats),
            ("mechanical_only", decomposition.mechanical_only_seats),
            ("strategic", decomposition.strategic_seats),
            ("action", decomposition.action_seats),
        ):
            lines.append(f"  {label:<18}{seats}")
        for n in decomposition.notes:
            lines.append(f"  - {n}")

    lines.append("")
    lines.append("Sensitivity (does the top action survive different assumptions?):")
    for sc in result["sensitivity"]:
        flag = "" if sc["clear_best"] else "  (no clear best)"
        lines.append(f"  {sc['scenario']:<26} -> {str(sc['top']):<24} gap={sc['gap']:.3f}{flag}")
    baseline_top = next((s["top"] for s in result["sensitivity"] if s["scenario"] == "baseline"), None)
    flips = [s["scenario"] for s in result["sensitivity"] if s["top"] != baseline_top]
    if flips:
        lines.append(f"  ! Recommendation FLIPS under: {flips}. Treat as fragile.")
    else:
        lines.append("  Recommendation is stable across the probed assumptions.")
    lines.append("=" * 70)
    return "\n".join(lines)
