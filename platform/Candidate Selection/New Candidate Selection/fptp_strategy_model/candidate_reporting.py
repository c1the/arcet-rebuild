# Candidate selection reporting 

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .candidate_selection import CandidateSelectionReport


def _fmt(x: float, nd: int = 2) -> str:
    if x != x:  # NaN
        return "-"
    if x == float("inf"):
        return "inf"
    return f"{x:.{nd}f}"


def format_candidate_report(report: "CandidateSelectionReport") -> str:
    L: list[str] = []
    L.append("=" * 78)
    L.append(f"CANDIDATE SELECTION  --  decision support for party: {report.party_id}")
    L.append(f"Mode: {report.mode}")
    L.append("=" * 78)
    L.append("DECISION SUPPORT ONLY -- not an automatic nomination. Human review required.")
    L.append("")

    w = report.weights
    wparts = [f"{n}={getattr(w, n):g}" for n in w.KNOWN if getattr(w, n)]
    if w.target_district:
        wparts.append(f"target_district={w.target_district}")
    L.append(f"Objective weights : {', '.join(wparts) if wparts else '(all zero)'}")
    L.append("")

    # Ranking table.
    L.append("Ranked options (by risk-adjusted score J):")
    L.append(
        f"  {'option':<22}{'J':>8}{'E[U]':>8}{'SD':>7}{'LCB':>8}"
        f"{'P(tgt)':>8}{'E[seats]':>10}{'band':>6}"
    )
    for s in report.ranked:
        L.append(
            f"  {s.option_id:<22}{s.J:>8.3f}{s.mean_utility:>8.3f}{s.std_utility:>7.3f}"
            f"{s.lcb:>8.3f}{_fmt(s.p_target_win):>8}{s.expected_seats:>10.2f}{s.tie_band:>6}"
        )
    L.append("")
    L.append(f"Decision status: {report.decision_message}")
    L.append("")

    # Drivers / decompo for the top option.
    if report.ranked:
        top = report.ranked[0]
        L.append(f"Score decomposition for top option '{top.option_id}':")
        for label, val in (
            ("electoral", top.electoral_component),
            ("policy_fit", top.policy_component),
            ("candidate_valence", top.valence_component),
            ("local_fit", top.local_fit_component),
            ("selectorate_legitimacy", top.selectorate_component),
            ("representation", top.representation_component),
            ("risk_penalty (deterministic)", -top.risk_penalty),
            ("constraint_penalty (soft)", -top.constraint_penalty),
        ):
            L.append(f"  {label:<32}{val:>9.3f}")
        if top.constraint_violations:
            L.append("  soft-constraint notes:")
            for note in top.constraint_violations:
                L.append(f"    - {note}")
        L.append("")
        # Primary-driver sentence: what SEPARATES top from runner-up,
        # not the largest absolute component (electoral is often identical).
        def comps(s):
            return {
                "electoral viability": s.electoral_component,
                "policy fit": s.policy_component,
                "candidate valence": s.valence_component,
                "local fit": s.local_fit_component,
                "selectorate legitimacy": s.selectorate_component,
                "representation": s.representation_component,
            }
        if len(report.ranked) > 1:
            ru = report.ranked[1]
            ct, cr = comps(top), comps(ru)
            diffs = {k: ct[k] - cr[k] for k in ct}
            top_lead = max(diffs, key=diffs.get)
            ru_lead = min(diffs, key=diffs.get)
            line = f"Primary driver: '{top.option_id}' leads on {top_lead}"
            if diffs[ru_lead] < 0:
                line += f"; '{ru.option_id}' leads on {ru_lead}"
            if top.tie_band == ru.tie_band:
                line += " (both within the same tie band)"
            L.append(line + ".")
        else:
            lead = max(comps(top), key=comps(top).get)
            L.append(f"Primary driver of the only option: {lead}.")
        L.append("")

    # Exclusions.
    if report.excluded:
        L.append("Excluded by hard constraints:")
        for e in report.excluded:
            L.append(f"  {e['option_id']}: {'; '.join(e['violations'])}")
        L.append("")

    # Sensitivity.
    L.append("Sensitivity (does the top option survive different assumptions?):")
    for sc in report.sensitivity:
        flag = "" if not sc.get("flips_from_baseline") else "  <-- FLIPS"
        cb = "" if sc["clear_best"] else "  (no clear best)"
        L.append(f"  {sc['scenario']:<26} -> {str(sc['top']):<22} gap={_fmt(sc['gap'], 3)}{cb}{flag}")
    flips = [s["scenario"] for s in report.sensitivity if s.get("flips_from_baseline")]
    if flips:
        L.append(f"  ! Ranking is FRAGILE: top option flips under {flips}.")
    else:
        L.append("  Top option is stable across the probed assumptions.")
    L.append("")

    # Fairness audit.
    if report.fairness and report.fairness.get("enabled"):
        L.append("Representation / fairness audit (opt-in; attributes never inferred):")
        for stage in ("pool", "eligible", "shortlist", "selected"):
            comp = report.fairness.get(stage)
            if comp:
                L.append(f"  {stage} (n={comp['n']}): {comp['counts']}")
        comp_tgt = report.fairness.get("target_compliance") or {}
        for k, v in comp_tgt.items():
            status = "MET" if v["met"] else "NOT MET"
            L.append(
                f"  target {k}: actual={v['actual_share']:.2f} vs target={v['target_share']:.2f} [{status}]"
            )
        for wn in report.fairness.get("warnings", []):
            L.append(f"  ! {wn}")
        L.append("")

    # Data-quality warnings.
    if report.warnings:
        L.append("Data-quality warnings:")
        for wn in report.warnings:
            L.append(f"  - {wn}")
        L.append("")

    # Reproducibility.
    L.append("Reproducibility metadata:")
    for k, v in report.reproducibility.items():
        L.append(f"  {k}: {v}")
    L.append("=" * 78)
    return "\n".join(L)
