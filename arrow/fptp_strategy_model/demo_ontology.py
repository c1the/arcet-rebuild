# Demo: drive the FPTP engine from an ontology FPTPContext and print the
# scenario payload that would be POSTed to /api/fptp/scenarios.

from __future__ import annotations

import json

from fptp_strategy_model import FPTPContext, assess_constituency

# This is exactly the JSON shape the ontology's getFPTPContext() returns.
CONTEXT = {
    "constituencyEntityId": "con-northbridge",
    "candidateEntityId": "cand-alpha",
    "electionHistory": [
        {"electionDate": "2024-07-04", "partyEntityId": "CON", "voteShare": 0.44, "votes": 23000, "position": 1, "candidateEntityId": None},
        {"electionDate": "2024-07-04", "partyEntityId": "SOC", "voteShare": 0.40, "votes": 21000, "position": 2, "candidateEntityId": None},
        {"electionDate": "2024-07-04", "partyEntityId": "GRN", "voteShare": 0.16, "votes": 8000, "position": 3, "candidateEntityId": None},
    ],
    "seatAssessment": {
        "overallFitScore": 71.0, "developmentPotentialScore": 64.0, "riskScore": 22.0,
        "localConnectionScore": 69.0, "readinessScore": 67.0,
    },
    "localPartyStrength": 4, "stakeholderCoverageScore": 60.0,
    "issueVolatility": 3, "tacticalVotingRisk": 3, "spoilerRisk": 2,
    "targetStatus": "MARGINAL", "strategicPriority": "HIGH",
}


def main() -> None:
    ctx = FPTPContext.from_dict(CONTEXT)
    result = assess_constituency(ctx, candidate_party="SOC", n_simulations=800, seed=1)

    print("=" * 64)
    print(f"Constituency : {ctx.constituency_entity_id}")
    print(f"Candidate    : {ctx.candidate_entity_id} (party SOC)")
    print("-" * 64)
    print(f"P(win)              : {result.win_probability:.2f}")
    print(f"Vote-share band     : {result.vote_share_band} (low/mid/high, %)")
    print(f"Converged fraction  : {result.converged_fraction:.3f}")
    print(f"Recommendation      : {result.scenario_input.recommendation_label.value}")
    print(f"Scenario type        : {result.scenario_input.scenario_type.value}")
    print(f"Rationale           : {result.scenario_input.rationale}")
    print("-" * 64)
    print("POST /api/fptp/scenarios  body:")
    print(json.dumps(result.scenario_input.to_payload(), indent=2))
    print("=" * 64)

    # With a running ontology server you would instead do:
    #   from fptp_strategy_model import OntologyClient
    #   client = OntologyClient("http://localhost:3000", token="...")
    #   saved = client.assess_and_save("con-northbridge", "SOC",
    #                                  candidate_id="cand-alpha", n_simulations=800)


if __name__ == "__main__":
    main()
