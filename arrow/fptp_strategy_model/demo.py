# Demo For explanation

from __future__ import annotations

import numpy as np

from fptp_strategy_model import (
    Action, Bloc, DistrictData, ElectionConfig, EntryCoordinationModel,
    ObjectiveWeights, PreferenceModel, RiskConfig, StrategyModel, VoteModel,
    format_report,
)
from fptp_strategy_model.strategic import StrategicParams


def build_election():
    # One issue dimension (left <-> right). Party positions:
    pm = PreferenceModel(
        candidate_positions={"GRN": np.array([-1.2]), "SOC": np.array([-0.4]), "CON": np.array([0.8])},
        valence={"GRN": 0.0, "SOC": 0.3, "CON": 0.4},
        beta=1.0,
    )

    rng = np.random.default_rng(7)
    districts = []
    # Each district = a mix of left/centre/right voter segments with slightly
    # different weights, giving a spread of safe and marginal seats.
    profiles = [
        # (left_w, centre_w, right_w, region)
        (0.20, 0.30, 0.50, "north"),   # CON-leaning
        (0.25, 0.35, 0.40, "north"),   # CON marginal
        (0.30, 0.40, 0.30, "midlands"),# 3-way marginal
        (0.35, 0.40, 0.25, "midlands"),# SOC-leaning marginal
        (0.45, 0.35, 0.20, "south"),   # SOC safe-ish
        (0.30, 0.30, 0.40, "south"),   # CON marginal
        (0.38, 0.34, 0.28, "midlands"),# SOC-leaning marginal
    ]
    for i, (lw, cw, rw, region) in enumerate(profiles):
        blocs = [
            pm.bloc_from_segment([-1.1], size=lw, expressive_cost=0.6, info_level=0.9, label="left"),
            pm.bloc_from_segment([-0.2], size=cw, expressive_cost=0.4, info_level=0.9, label="centre"),
            pm.bloc_from_segment([0.9], size=rw, expressive_cost=0.6, info_level=0.9, label="right"),
        ]
        districts.append(DistrictData(district_id=f"D{i+1}", electorate=70_000,
                                      turnout=0.66, blocs=blocs, region=region))

    cfg = ElectionConfig(
        candidate_ids=["GRN", "SOC", "CON"],
        governing_threshold=4,  # 4 of 7 seats = control
        allowed_action_types=["status_quo", "allocate", "reposition", "mobilise", "release_info"],
    )
    return cfg, districts


def main():
    cfg, districts = build_election()
    model = StrategyModel(
        config=cfg,
        districts=districts,
        vote_model=VoteModel(tau=0.30),
        strategic_params=StrategicParams(),
        coordination=EntryCoordinationModel(transfer_matrix={"GRN": {"SOC": 0.7}}),
        sampler_kwargs=dict(national_swing_sd=0.12, local_swing_sd=0.08,
                            region_swing_sd=0.05, perceived_sigma=0.05),
    )

    actor = "SOC"
    marginals = ["D2", "D3", "D4", "D6", "D7"]
    actions = [
        Action("status_quo", actor, label="status_quo"),
        Action("allocate", actor, params={"effort": {d: 8.0 for d in marginals}},
               action_cost=0.10, label="allocate->marginals"),
        Action("allocate", actor, params={"effort": {"D5": 20.0}},
               action_cost=0.10, label="allocate->safe_seat(waste)"),
        Action("mobilise", actor, params={"effort": {d: 10.0 for d in marginals}},
               action_cost=0.08, label="mobilise->marginals"),
        Action("reposition", actor, params={"gain": 0.30, "base_cost": 0.25},
               reputational_cost=0.15, label="reposition->centre"),
        Action("release_info", actor, params={"sigma_factor": 0.5},
               action_cost=0.03, label="publish_viability_poll"),
    ]

    weights = ObjectiveWeights(w_seats=1.0, w_vote=2.0)
    result = model.recommend(
        actions, actor, weights,
        risk=RiskConfig(lambda_risk=0.3, metric="std"),
        kappa=0.05, n_simulations=600, seed=1,
    )
    print(format_report(result, actor))

    print("\nSame contest, but the objective is now PROBABILITY OF CONTROL "
          "(>= 4 seats):")
    result2 = model.recommend(
        actions, actor, ObjectiveWeights(w_majority=1.0),
        risk=RiskConfig(lambda_risk=0.0), kappa=0.02, n_simulations=600, seed=1,
    )
    print(format_report(result2, actor))


if __name__ == "__main__":
    main()
