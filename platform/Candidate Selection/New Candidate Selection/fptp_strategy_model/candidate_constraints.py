# Candidate-selection constraints

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .candidate import CandidateProfile, CandidateSlate, SelectionConstraint
from .selection_process import SelectorateRule


@dataclass
class ConstraintResult:
    eligible: bool
    hard_violations: List[str]
    soft_penalty: float
    soft_notes: List[str]


def _check_one(
    cons: SelectionConstraint, cand: CandidateProfile, district_id: str
) -> tuple[bool, Optional[str]]:
    p = cons.params
    t = cons.type
    if t == "legal":
        excluded = set(p.get("excluded_candidates", []))
        if cand.candidate_id in excluded:
            return False, f"{cand.candidate_id}: legally excluded by '{cons.constraint_id}'."
    elif t == "eligibility":
        if "min_local_affinity" in p:
            la = cand.local_affinity.get(district_id, 0.0)
            if la < p["min_local_affinity"]:
                return False, (
                    f"{cand.candidate_id}: local affinity {la:.2f} < required "
                    f"{p['min_local_affinity']:.2f} in {district_id}."
                )
        if p.get("requires_eligible_flag") and district_id not in cand.eligible_districts:
            return False, f"{cand.candidate_id}: not eligible in {district_id}."
    elif t == "conflict":
        conflicts: Dict[str, List[str]] = p.get("conflicts", {})
        if district_id in conflicts.get(cand.candidate_id, []):
            return False, f"{cand.candidate_id}: conflict of interest in {district_id}."
    elif t == "selectorate":
        if "min_selectorate_support" in p:
            s = cand.selectorate_support.get(district_id, 0.0)
            if s < p["min_selectorate_support"]:
                return False, (
                    f"{cand.candidate_id}: selectorate support {s:.2f} < "
                    f"{p['min_selectorate_support']:.2f}."
                )
    elif t == "resource":
        if "min_campaign_capacity" in p:
            c = cand.campaign_capacity.get(district_id, 0.0)
            if c < p["min_campaign_capacity"]:
                return False, (
                    f"{cand.candidate_id}: campaign capacity {c:.2f} < "
                    f"{p['min_campaign_capacity']:.2f}."
                )
    elif t == "representation":
        # Single-candidate representation requirement.
        attr = p.get("attribute")
        required = p.get("required_value")
        if attr is not None and required is not None:
            have = cand.representation_attributes.get(attr)
            if have != required:
                return False, (
                    f"{cand.candidate_id}: representation requirement "
                    f"{attr}={required} not met (value={have!r})."
                )
    return True, None


class ConstraintEngine:
    def __init__(
        self,
        constraints: List[SelectionConstraint],
        selectorate: Optional[SelectorateRule] = None,
    ):
        self.constraints = constraints
        self.selectorate = selectorate

    def evaluate_candidate(
        self, cand: CandidateProfile, district_id: str, party_id: str
    ) -> ConstraintResult:
        hard: List[str] = []
        soft_penalty = 0.0
        soft_notes: List[str] = []

        # Built-in eligibility: party match + declared district eligibility.
        if cand.party_id != party_id:
            hard.append(f"{cand.candidate_id}: belongs to party {cand.party_id}, not {party_id}.")
        if district_id not in cand.eligible_districts:
            hard.append(f"{cand.candidate_id}: {district_id} not in eligible_districts.")

        # Selectorate candidacy requirements (hard).
        if self.selectorate is not None:
            hard.extend(self.selectorate.candidacy_violations(cand, district_id))

        # Configurable constraints.
        for cons in self.constraints:
            passed, msg = _check_one(cons, cand, district_id)
            if passed:
                continue
            if cons.hard:
                hard.append(msg or f"{cand.candidate_id}: failed {cons.constraint_id}.")
            else:
                soft_penalty += float(cons.penalty)
                soft_notes.append(
                    f"soft penalty {cons.penalty:+.3f} from '{cons.constraint_id}': {msg}"
                )

        return ConstraintResult(
            eligible=not hard,
            hard_violations=hard,
            soft_penalty=soft_penalty,
            soft_notes=soft_notes,
        )

    def evaluate_slate(
        self,
        slate: CandidateSlate,
        candidates: Dict[str, CandidateProfile],
        party_id: str,
    ) -> ConstraintResult:
        hard: List[str] = []
        soft_penalty = 0.0
        soft_notes: List[str] = []

        # Per-assignment checks.
        for did, cid in slate.assignments.items():
            cand = candidates.get(cid)
            if cand is None:
                hard.append(f"slate {slate.slate_id}: unknown candidate '{cid}'.")
                continue
            r = self.evaluate_candidate(cand, did, party_id)
            hard.extend(r.hard_violations)
            soft_penalty += r.soft_penalty
            soft_notes.extend(r.soft_notes)

        # Max one district per candidate
        seen: Dict[str, str] = {}
        for did, cid in slate.assignments.items():
            if cid in seen:
                hard.append(
                    f"slate {slate.slate_id}: candidate '{cid}' assigned to "
                    f"{seen[cid]} and {did} (max one district per candidate)."
                )
            seen[cid] = did

        # Slate-level representation quota (hard or soft).
        for cons in self.constraints:
            if cons.type != "representation":
                continue
            attr = cons.params.get("attribute")
            value = cons.params.get("required_value")
            min_count = cons.params.get("min_count")
            if attr is None or value is None or min_count is None:
                continue
            count = sum(
                1
                for cid in slate.assignments.values()
                if candidates.get(cid)
                and candidates[cid].representation_attributes.get(attr) == value
            )
            if count < min_count:
                msg = (
                    f"slate {slate.slate_id}: only {count} of required {min_count} "
                    f"candidates with {attr}={value}."
                )
                if cons.hard:
                    hard.append(msg)
                else:
                    soft_penalty += float(cons.penalty)
                    soft_notes.append(f"soft penalty {cons.penalty:+.3f}: {msg}")

        return ConstraintResult(
            eligible=not hard,
            hard_violations=hard,
            soft_penalty=soft_penalty,
            soft_notes=soft_notes,
        )
