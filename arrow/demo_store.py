"""
demo_store.py — Seeded demo intelligence store for the Arcet Signal Demo.

ALL records in this module are fictitious demo data ("realOrDemo": "demo").
They exist so the demo can show the full Arcet loop:

    stored context -> Neural Signal Layer v0 -> Arrow FPTP simulation -> recommendation

without requiring a database, the platform backend, or user-pasted articles.

Real replacement point: swap `build_context()` for a retrieval layer that
queries the Arcet platform's structured memory (signals, relationships,
risks, events, memory records) filtered by candidate + seat + scenario.

No logic beyond simple filtering lives here — scoring is in neural_signal.py,
simulation mapping is in demo_router.py.
"""
from __future__ import annotations

from typing import Dict, List, Optional

DEMO_FLAG = "demo"

# ── Candidates ────────────────────────────────────────────────────────────────
# `party` uses the same title-case keys as blocs.PROXIMITY / election history
# partyEntityId so the candidate's party lines up with simulated vote shares.

CANDIDATES: Dict[str, Dict] = {
    "cand_a": {
        "id": "cand_a",
        "name": "Amara Okafor",
        "party": "Green",
        "leaning": "progressive",
        "bio": "Housing campaigner and community organiser. Demo profile — not a real person.",
        "attributes": {"baseStrength": 0.68, "mediaExposure": 0.35, "factionTension": 0.30},
        "issueCredibility": {"housing": 0.82, "nhs": 0.55, "economy": 0.42},
        "seatFit": {"E14001131": 0.78, "E14001279": 0.42, "E14001113": 0.35},
        "realOrDemo": DEMO_FLAG,
    },
    "cand_b": {
        "id": "cand_b",
        "name": "David Renshaw",
        "party": "Lab",
        "leaning": "centre-left",
        "bio": "Two-term councillor with local government experience. Demo profile — not a real person.",
        "attributes": {"baseStrength": 0.61, "mediaExposure": 0.45, "factionTension": 0.52},
        "issueCredibility": {"housing": 0.58, "nhs": 0.71, "economy": 0.60},
        "seatFit": {"E14001131": 0.55, "E14001279": 0.68, "E14001113": 0.74},
        "realOrDemo": DEMO_FLAG,
    },
    "cand_c": {
        "id": "cand_c",
        "name": "Priya Sharma",
        "party": "Con",
        "leaning": "centre-right",
        "bio": "Small-business owner, first-time candidate. Demo profile — not a real person.",
        "attributes": {"baseStrength": 0.52, "mediaExposure": 0.58, "factionTension": 0.44},
        "issueCredibility": {"housing": 0.40, "nhs": 0.44, "economy": 0.72},
        "seatFit": {"E14001131": 0.30, "E14001279": 0.61, "E14001113": 0.22},
        "realOrDemo": DEMO_FLAG,
    },
}

# Tolerate the alternative id scheme used in some planning docs (pol_a etc.).
CANDIDATE_ALIASES: Dict[str, str] = {
    "pol_a": "cand_a", "pol_b": "cand_b", "pol_c": "cand_c",
    "candidate_a": "cand_a", "candidate_b": "cand_b", "candidate_c": "cand_c",
}

# ── Seats ─────────────────────────────────────────────────────────────────────
# The three real GIS seats that are demo-linked to seeded platform entities.
# electionHistory shares are seeded approximations of GE2024 and are replaced
# by real HoC registry shares in demo_router when the registry is loaded.

SEATS: Dict[str, Dict] = {
    "E14001131": {
        "code": "E14001131",
        "name": "Bristol Central",
        "region": "South West",
        "demoBackendAlias": "Northbridge",
        "targetStatus": "TARGET",
        "strategicPriority": "HIGH",
        "developmentPotential": 72,
        "issueVolatility": 4,        # 1..5
        "tacticalVotingRisk": 4,     # 1..5
        "spoilerRisk": 2,            # 1..5
        "keyIssues": ["housing", "renting", "climate"],
        "electionHistory": [
            {"electionDate": "2024-07-04", "partyEntityId": "Green",  "voteShare": 0.53, "position": 1},
            {"electionDate": "2024-07-04", "partyEntityId": "Lab",    "voteShare": 0.33, "position": 2},
            {"electionDate": "2024-07-04", "partyEntityId": "Con",    "voteShare": 0.05, "position": 3},
            {"electionDate": "2024-07-04", "partyEntityId": "LD",     "voteShare": 0.04, "position": 4},
            {"electionDate": "2024-07-04", "partyEntityId": "Reform", "voteShare": 0.03, "position": 5},
        ],
        "realOrDemo": DEMO_FLAG,
    },
    "E14001279": {
        "code": "E14001279",
        "name": "Hendon",
        "region": "London",
        "demoBackendAlias": "Easthaven",
        "targetStatus": "MARGINAL",
        "strategicPriority": "CRITICAL",
        "developmentPotential": 58,
        "issueVolatility": 3,
        "tacticalVotingRisk": 5,
        "spoilerRisk": 3,
        "keyIssues": ["nhs", "economy", "community safety"],
        "electionHistory": [
            {"electionDate": "2024-07-04", "partyEntityId": "Lab",    "voteShare": 0.38, "position": 1},
            {"electionDate": "2024-07-04", "partyEntityId": "Con",    "voteShare": 0.38, "position": 2},
            {"electionDate": "2024-07-04", "partyEntityId": "Reform", "voteShare": 0.11, "position": 3},
            {"electionDate": "2024-07-04", "partyEntityId": "LD",     "voteShare": 0.08, "position": 4},
            {"electionDate": "2024-07-04", "partyEntityId": "Green",  "voteShare": 0.05, "position": 5},
        ],
        "realOrDemo": DEMO_FLAG,
    },
    "E14001113": {
        "code": "E14001113",
        "name": "Bootle",
        "region": "North West",
        "demoBackendAlias": "Westfield",
        "targetStatus": "SAFE",
        "strategicPriority": "LOW",
        "developmentPotential": 35,
        "issueVolatility": 2,
        "tacticalVotingRisk": 1,
        "spoilerRisk": 2,
        "keyIssues": ["nhs", "jobs", "regeneration"],
        "electionHistory": [
            {"electionDate": "2024-07-04", "partyEntityId": "Lab",    "voteShare": 0.68, "position": 1},
            {"electionDate": "2024-07-04", "partyEntityId": "Reform", "voteShare": 0.14, "position": 2},
            {"electionDate": "2024-07-04", "partyEntityId": "Con",    "voteShare": 0.08, "position": 3},
            {"electionDate": "2024-07-04", "partyEntityId": "Green",  "voteShare": 0.06, "position": 4},
            {"electionDate": "2024-07-04", "partyEntityId": "LD",     "voteShare": 0.04, "position": 5},
        ],
        "realOrDemo": DEMO_FLAG,
    },
}

# ── Source-derived signals ────────────────────────────────────────────────────
# direction: +1 helps the linked candidate/seat position, -1 hurts.
# magnitude: 0..1 effect size. candidateId None => seat-level signal.

SIGNALS: List[Dict] = [
    {"id": "sig_001", "type": "political_signal", "seatCode": "E14001131", "candidateId": "cand_a",
     "topic": "housing", "direction": 1, "magnitude": 0.8,
     "summary": "Candidate led a high-profile renters' rights campaign covered by local press.",
     "source": "demo_local_press", "date": "2026-05-14", "confidence": "high", "realOrDemo": DEMO_FLAG},
    {"id": "sig_002", "type": "political_signal", "seatCode": "E14001131", "candidateId": "cand_a",
     "topic": "stakeholders", "direction": -1, "magnitude": 0.5,
     "summary": "Two housing associations declined to co-host candidate events this quarter.",
     "source": "demo_stakeholder_notes", "date": "2026-06-02", "confidence": "medium", "realOrDemo": DEMO_FLAG},
    {"id": "sig_003", "type": "political_signal", "seatCode": "E14001131", "candidateId": None,
     "topic": "renting", "direction": 1, "magnitude": 0.6,
     "summary": "Private rent inflation in the seat is running well above the regional average.",
     "source": "demo_constituency_stats", "date": "2026-04-20", "confidence": "high", "realOrDemo": DEMO_FLAG},
    {"id": "sig_004", "type": "political_signal", "seatCode": "E14001131", "candidateId": "cand_b",
     "topic": "housing", "direction": -1, "magnitude": 0.4,
     "summary": "Candidate's past council vote on estate redevelopment resurfacing in local forums.",
     "source": "demo_social_monitoring", "date": "2026-05-30", "confidence": "medium", "realOrDemo": DEMO_FLAG},
    {"id": "sig_005", "type": "political_signal", "seatCode": "E14001279", "candidateId": "cand_b",
     "topic": "nhs", "direction": 1, "magnitude": 0.7,
     "summary": "Candidate's NHS waiting-list plan endorsed by a local GP federation.",
     "source": "demo_stakeholder_notes", "date": "2026-05-22", "confidence": "high", "realOrDemo": DEMO_FLAG},
    {"id": "sig_006", "type": "political_signal", "seatCode": "E14001279", "candidateId": None,
     "topic": "tactical_voting", "direction": -1, "magnitude": 0.6,
     "summary": "Seat decided by double-digit votes in 2024; third-party squeeze highly likely again.",
     "source": "demo_election_analysis", "date": "2026-03-11", "confidence": "high", "realOrDemo": DEMO_FLAG},
    {"id": "sig_007", "type": "political_signal", "seatCode": "E14001279", "candidateId": "cand_c",
     "topic": "economy", "direction": 1, "magnitude": 0.5,
     "summary": "Candidate's high-street revival pitch drew strong turnout at business breakfast.",
     "source": "demo_event_report", "date": "2026-06-10", "confidence": "medium", "realOrDemo": DEMO_FLAG},
    {"id": "sig_008", "type": "political_signal", "seatCode": "E14001279", "candidateId": "cand_c",
     "topic": "media", "direction": -1, "magnitude": 0.6,
     "summary": "Regional paper questioning candidate's company's past contract with the council.",
     "source": "demo_media_monitoring", "date": "2026-06-18", "confidence": "medium", "realOrDemo": DEMO_FLAG},
    {"id": "sig_009", "type": "political_signal", "seatCode": "E14001113", "candidateId": "cand_b",
     "topic": "regeneration", "direction": 1, "magnitude": 0.6,
     "summary": "Candidate credited locally with securing dockside regeneration funding.",
     "source": "demo_local_press", "date": "2026-04-08", "confidence": "high", "realOrDemo": DEMO_FLAG},
    {"id": "sig_010", "type": "political_signal", "seatCode": "E14001113", "candidateId": None,
     "topic": "turnout", "direction": -1, "magnitude": 0.4,
     "summary": "Membership activity in the local party at a five-year low; delivery capacity limited.",
     "source": "demo_local_association", "date": "2026-05-05", "confidence": "medium", "realOrDemo": DEMO_FLAG},
    {"id": "sig_011", "type": "political_signal", "seatCode": "E14001131", "candidateId": "cand_c",
     "topic": "climate", "direction": -1, "magnitude": 0.5,
     "summary": "Candidate's clean-air scheme comments poorly received at a residents' meeting.",
     "source": "demo_event_report", "date": "2026-05-19", "confidence": "medium", "realOrDemo": DEMO_FLAG},
    {"id": "sig_012", "type": "political_signal", "seatCode": "E14001279", "candidateId": "cand_a",
     "topic": "localFit", "direction": -1, "magnitude": 0.5,
     "summary": "Candidate has no prior campaign footprint in the seat; low name recognition.",
     "source": "demo_canvass_returns", "date": "2026-06-01", "confidence": "medium", "realOrDemo": DEMO_FLAG},
]

# ── Relationships (stakeholder map) ───────────────────────────────────────────
# stance: supportive | neutral | hostile.  strength: 0..1 influence weight.

RELATIONSHIPS: List[Dict] = [
    {"id": "rel_001", "seatCode": "E14001131", "entity": "Riverside Housing Association",
     "kind": "stakeholder_org", "stance": "neutral", "strength": 0.7,
     "note": "Open to engagement but has not endorsed anyone.", "realOrDemo": DEMO_FLAG},
    {"id": "rel_002", "seatCode": "E14001131", "entity": "Central Renters' Union",
     "kind": "campaign_group", "stance": "supportive", "strength": 0.8,
     "note": "Aligned with renters' rights platform; strong volunteer base.", "realOrDemo": DEMO_FLAG},
    {"id": "rel_003", "seatCode": "E14001131", "entity": "Harbourside Business Forum",
     "kind": "business_group", "stance": "hostile", "strength": 0.5,
     "note": "Opposes clean-air zone expansion.", "realOrDemo": DEMO_FLAG},
    {"id": "rel_004", "seatCode": "E14001279", "entity": "Hendon GP Federation",
     "kind": "stakeholder_org", "stance": "supportive", "strength": 0.6,
     "note": "Backed the NHS waiting-list plan.", "realOrDemo": DEMO_FLAG},
    {"id": "rel_005", "seatCode": "E14001279", "entity": "North London Traders' Guild",
     "kind": "business_group", "stance": "neutral", "strength": 0.6,
     "note": "Split membership; winnable with an economy-first message.", "realOrDemo": DEMO_FLAG},
    {"id": "rel_006", "seatCode": "E14001113", "entity": "Dockside Community Trust",
     "kind": "stakeholder_org", "stance": "supportive", "strength": 0.7,
     "note": "Long-standing partner on regeneration projects.", "realOrDemo": DEMO_FLAG},
    {"id": "rel_007", "seatCode": "E14001113", "entity": "Merseyside Ports Workers' Branch",
     "kind": "union_branch", "stance": "supportive", "strength": 0.6,
     "note": "Reliable turnout support at election time.", "realOrDemo": DEMO_FLAG},
]

# ── Risks ─────────────────────────────────────────────────────────────────────
# category: media | faction | stakeholder | operational.  severity: low|medium|high.
# Counts per seat intentionally mirror the seeded platform-backend demo
# (Bristol Central 3 medium, Hendon 1 low, Bootle 1 medium).

RISKS: List[Dict] = [
    {"id": "risk_001", "seatCode": "E14001131", "category": "stakeholder", "severity": "medium",
     "summary": "Housing associations cooling on engagement before conference season.",
     "status": "open", "realOrDemo": DEMO_FLAG},
    {"id": "risk_002", "seatCode": "E14001131", "category": "faction", "severity": "medium",
     "summary": "Local branch split over clean-air zone expansion messaging.",
     "status": "open", "realOrDemo": DEMO_FLAG},
    {"id": "risk_003", "seatCode": "E14001131", "category": "media", "severity": "medium",
     "summary": "Student-landlord dispute story could cut against the renters' platform.",
     "status": "open", "realOrDemo": DEMO_FLAG},
    {"id": "risk_004", "seatCode": "E14001279", "category": "operational", "severity": "low",
     "summary": "Canvassing coverage thin in two northern wards.",
     "status": "open", "realOrDemo": DEMO_FLAG},
    {"id": "risk_005", "seatCode": "E14001113", "category": "faction", "severity": "medium",
     "summary": "Selection dispute from 2024 still souring relations with a ward branch.",
     "status": "open", "realOrDemo": DEMO_FLAG},
]

# ── Recent events ─────────────────────────────────────────────────────────────

RECENT_EVENTS: List[Dict] = [
    {"id": "evt_001", "seatCode": "E14001131", "candidateId": "cand_a", "date": "2026-06-20",
     "kind": "public_meeting", "summary": "Renters' assembly drew ~200 attendees; strong reception.",
     "realOrDemo": DEMO_FLAG},
    {"id": "evt_002", "seatCode": "E14001131", "candidateId": None, "date": "2026-06-12",
     "kind": "policy_announcement", "summary": "Council consultation opened on clean-air zone expansion.",
     "realOrDemo": DEMO_FLAG},
    {"id": "evt_003", "seatCode": "E14001279", "candidateId": "cand_b", "date": "2026-06-15",
     "kind": "stakeholder_meeting", "summary": "Roundtable with GP federation on waiting-list plan.",
     "realOrDemo": DEMO_FLAG},
    {"id": "evt_004", "seatCode": "E14001279", "candidateId": "cand_c", "date": "2026-06-18",
     "kind": "media_story", "summary": "Regional paper ran the council-contract questions piece.",
     "realOrDemo": DEMO_FLAG},
    {"id": "evt_005", "seatCode": "E14001113", "candidateId": "cand_b", "date": "2026-05-28",
     "kind": "site_visit", "summary": "Dockside regeneration phase-two ground-breaking.",
     "realOrDemo": DEMO_FLAG},
]

# ── Memory records ────────────────────────────────────────────────────────────
# Structured memory, not raw conversation — mirrors the Arcet memory contract.

MEMORY_RECORDS: List[Dict] = [
    {"id": "mem_001", "type": "previous_recommendation", "module": "Arrow",
     "seatCode": "E14001131", "candidateId": "cand_a",
     "content": "Prior run (2026-05): compete selectively; stakeholder support was the flagged gap.",
     "status": "accepted", "confidence": "medium", "source": "demo_prior_scenario",
     "date": "2026-05-10", "lastVerified": "2026-06-25", "realOrDemo": DEMO_FLAG},
    {"id": "mem_002", "type": "model_assumption", "module": "Arrow",
     "seatCode": "E14001131", "candidateId": None,
     "content": "Treat student-heavy wards as high-churn: registration drives shift turnout materially.",
     "status": "accepted", "confidence": "medium", "source": "demo_analysis_note",
     "date": "2026-04-02", "lastVerified": "2026-06-25", "realOrDemo": DEMO_FLAG},
    {"id": "mem_003", "type": "political_signal", "module": "Arrow",
     "seatCode": "E14001279", "candidateId": None,
     "content": "Tactical-voting sites listed this seat as a top-10 squeeze target in 2024.",
     "status": "accepted", "confidence": "high", "source": "demo_election_analysis",
     "date": "2026-03-11", "lastVerified": "2026-06-25", "realOrDemo": DEMO_FLAG},
    {"id": "mem_004", "type": "compliance_constraint", "module": "Arrow",
     "seatCode": None, "candidateId": None,
     "content": "Recommendations must stay aggregate-level: no voter-level targeting, no autonomous outreach.",
     "status": "accepted", "confidence": "high", "source": "demo_policy",
     "date": "2026-01-15", "lastVerified": "2026-06-25", "realOrDemo": DEMO_FLAG},
    {"id": "mem_005", "type": "previous_recommendation", "module": "Arrow",
     "seatCode": "E14001113", "candidateId": "cand_b",
     "content": "Prior run (2026-04): hold-and-maintain posture; monitor Reform second-place growth.",
     "status": "accepted", "confidence": "medium", "source": "demo_prior_scenario",
     "date": "2026-04-18", "lastVerified": "2026-06-25", "realOrDemo": DEMO_FLAG},
    {"id": "mem_006", "type": "data_source", "module": "Arrow",
     "seatCode": None, "candidateId": None,
     "content": "GE2024 vote shares come from the HoC results registry when loaded; seeded shares otherwise.",
     "status": "accepted", "confidence": "high", "source": "demo_pipeline_note",
     "date": "2026-06-25", "lastVerified": "2026-06-25", "realOrDemo": DEMO_FLAG},
]

# ── Context builder ───────────────────────────────────────────────────────────

def resolve_candidate_id(candidate_id: str) -> Optional[str]:
    cid = (candidate_id or "").strip().lower()
    cid = CANDIDATE_ALIASES.get(cid, cid)
    return cid if cid in CANDIDATES else None


def build_context(candidate_id: str, seat_code: str) -> Dict:
    """Assemble the compact demo context packet for one candidate + seat.

    Real replacement point: this becomes the Arcet retrieval/filter layer
    (filter by module/status/confidence/date, drop stale records, cap to a
    token budget). Here it is a simple in-memory filter over seeded records.
    """
    cid = resolve_candidate_id(candidate_id)
    if cid is None:
        raise KeyError(f"Unknown demo candidate: {candidate_id!r}. Known: {sorted(CANDIDATES)}")
    seat = SEATS.get((seat_code or "").strip())
    if seat is None:
        raise KeyError(f"Unknown demo seat: {seat_code!r}. Known: {sorted(SEATS)}")

    code = seat["code"]
    relevant = lambda r: r.get("seatCode") in (code, None) or r.get("candidateId") == cid

    return {
        "candidate": CANDIDATES[cid],
        "seat": seat,
        "relevantSignals": [s for s in SIGNALS
                            if s["seatCode"] == code and s["candidateId"] in (cid, None)],
        "relationships": [r for r in RELATIONSHIPS if r["seatCode"] == code],
        "risks": [r for r in RISKS if r["seatCode"] == code],
        "recentEvents": [e for e in RECENT_EVENTS
                         if e["seatCode"] == code and e["candidateId"] in (cid, None)],
        "memoryRecords": [m for m in MEMORY_RECORDS
                          if m["seatCode"] in (code, None) and m["candidateId"] in (cid, None)],
        "warnings": ["demo data — all records are seeded and fictitious"],
        "realOrDemo": DEMO_FLAG,
    }
