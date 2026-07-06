#Another test model

from __future__ import annotations

import numpy as np

from fptp_strategy_model import (
    Action, Bloc, DistrictData, ElectionConfig, EntryCoordinationModel,
    MechanicalSeatModel, ObjectiveWeights, Outcome, PayoffFunction, RiskConfig,
    StrategicParams, StrategicVotingModel, VoteModel, DecisionEngine, ActionScore,
)



# helpers

def one_district(blocs, did="D1", cands=None):
    return DistrictData(district_id=did, electorate=100_000, turnout=0.65,
                        blocs=blocs, candidates_present=cands)



# 1. Two-candidate FPTP reduces to simple plurality winner.

def test_two_candidate_plurality():
    mech = MechanicalSeatModel()
    shares = [{"A": 0.60, "B": 0.40}, {"A": 0.45, "B": 0.55}]
    assert mech.winners(shares) == ["A", "B"]
    seats = mech.seat_counts(shares, ["A", "B"])
    assert seats == {"A": 1, "B": 1}
    print("test 1 (two-candidate plurality): PASS")



# 2. Three candidates, perfect info + high tactical propensity ->
#    two viable vote-receiving candidates (the trailing one is deserted).

def _three_way_district(expr_cost_c=0.2):
    # National ordering A > B > C; C-voters prefer B second (near B).
    blocs = [
        Bloc(size=0.40, utility={"A": 5.0, "B": 1.0, "C": 0.0}, expressive_cost=0.2, info_level=1.0),
        Bloc(size=0.35, utility={"A": 0.0, "B": 5.0, "C": 1.0}, expressive_cost=0.2, info_level=1.0),
        Bloc(size=0.25, utility={"A": 0.0, "B": 3.0, "C": 5.0}, expressive_cost=expr_cost_c, info_level=1.0),
    ]
    return one_district(blocs)


def test_three_way_duverger_perfect_info():
    vm = VoteModel(tau=0.15)
    sv = StrategicVotingModel(vm, StrategicParams())
    d = _three_way_district()
    shares, win_prob, viable, conv = sv.run(d, sigma=0.02)  # low uncertainty
    assert conv
    # C should be deserted: small share, and only two candidates remain viable.
    assert shares["C"] < 0.12, shares
    assert shares["A"] > 0.30 and shares["B"] > 0.40, shares
    assert "C" not in viable, viable
    print(f"test 2 (Duverger, perfect info): PASS  shares={ {k: round(v,3) for k,v in shares.items()} } viable={viable}")



# 3. High uncertainty OR high expressive cost -> third-party support persists.

def test_third_party_persists():
    vm = VoteModel(tau=0.15)
    sv = StrategicVotingModel(vm, StrategicParams())

    # (a) High uncertainty widens the viable set so C stays in contention.
    d = _three_way_district()
    shares_hi, _, viable_hi, _ = sv.run(d, sigma=0.20)
    assert shares_hi["C"] > 0.18, shares_hi
    assert "C" in viable_hi, viable_hi

    # (b) Low uncertainty but very high expressive cost -> voters won't defect.
    d2 = _three_way_district(expr_cost_c=3.0)
    shares_cost, _, _, _ = sv.run(d2, sigma=0.02)
    assert shares_cost["C"] > 0.18, shares_cost
    print(f"test 3 (third-party persists): PASS  high-uncertainty C={shares_hi['C']:.3f}, high-cost C={shares_cost['C']:.3f}")


# 4. Seat-vote conversion shows a winner-seat bonus in a stylised two-party
#    district distribution.
 
def test_seat_vote_bonus():
    mech = MechanicalSeatModel()
    shares = []
    for _ in range(6):
        shares.append({"A": 0.52, "B": 0.48})  # A wins narrowly
    for _ in range(4):
        shares.append({"A": 0.45, "B": 0.55})  # B wins comfortably
    seats = mech.seat_counts(shares, ["A", "B"])
    n = len(shares)
    vote = mech.national_vote_share(shares, ["A", "B"])
    seat_share_A = seats["A"] / n
    assert seat_share_A > vote["A"], (seat_share_A, vote["A"])  # winner-seat bonus

    curve = mech.seats_votes_curve(shares, "A", "B")
    assert curve["swing_ratio"] > 1.0, curve["swing_ratio"]  # FPTP amplifies swings
    print(f"test 4 (seat-vote bonus): PASS  seat_share_A={seat_share_A:.2f} vs vote_A={vote['A']:.3f}, swing_ratio={curve['swing_ratio']:.2f}")



# 5. Withdrawal of a trailing candidate helps the ideologically nearby
#    candidate, per the transfer matrix / next preference.

def test_withdrawal_helps_neighbour():
    from fptp_strategy_model.state import ElectionState
    cfg = ElectionConfig(candidate_ids=["A", "B", "C"], allowed_action_types=["withdraw", "status_quo"])
    # A leads on first preferences but B+C together beat A; C is near B.
    blocs = [
        Bloc(size=0.42, utility={"A": 5.0, "B": 1.0, "C": 0.0}),
        Bloc(size=0.33, utility={"A": 0.0, "B": 5.0, "C": 2.0}),
        Bloc(size=0.25, utility={"A": 0.0, "B": 3.0, "C": 5.0}),  # C voters prefer B 2nd
    ]
    d = one_district(blocs)
    state = ElectionState(districts=[d], config=cfg, share_sigma={"D1": 0.02})
    vm = VoteModel(tau=0.15)
    mech = MechanicalSeatModel()

    before = mech.winners([vm.sincere_shares(d)])[0]
    assert before == "A", before  # A wins the split field on plurality

    coord = EntryCoordinationModel(transfer_matrix={"C": {"B": 0.9}})
    after_state = coord.withdraw(state, "C")
    after = mech.winners([vm.sincere_shares(after_state.districts[0])])[0]
    assert after == "B", after  # C's exit flips the seat to the nearby candidate B
    print(f"test 5 (withdrawal helps neighbour): PASS  winner {before} -> {after} after C withdraws")



# 6. The optimiser produces different recommendations for expected-seat
#    maximisation vs majority-probability maximisation.

class _StubSim:
    """A simulator stub that returns pre-baked outcomes per action label."""
    def __init__(self, table, candidates, district_ids):
        self.table = table
        self.candidates = candidates
        self._dids = district_ids

    def run_action(self, action, n_simulations, use_strategic=True):
        from fptp_strategy_model.simulate import SimResult
        seats_draws = self.table[action.label]
        outcomes = []
        for s in seats_draws:
            seats = {c: 0 for c in self.candidates}
            seats["A"] = s
            outcomes.append(Outcome(winners=["A"] * s, district_ids=self._dids,
                                    seats=seats, national_vote_share={"A": 0.5, "B": 0.5}))
        return SimResult(outcomes=outcomes, n_nonconverged=0,
                         sincere_shares=[], strategic_shares=[])


def test_objective_changes_recommendation():
    from fptp_strategy_model.decision import Optimizer
    threshold = 6
    # Action "steady": always 5 seats (high E[seats], never reaches majority).
    # Action "gamble": half the draws 6 seats, half 3 (lower E[seats], reaches majority often).
    table = {
        "steady": [5] * 100,
        "gamble": [6] * 50 + [3] * 50,
    }
    dids = [f"D{i}" for i in range(7)]
    sim = _StubSim(table, ["A", "B"], dids)
    payoff = PayoffFunction(governing_threshold=threshold)
    acts = [Action("allocate", "A", label="steady"), Action("allocate", "A", label="gamble")]

    seats_opt = Optimizer(sim, payoff, "A", ObjectiveWeights(w_seats=1.0))
    maj_opt = Optimizer(sim, payoff, "A", ObjectiveWeights(w_majority=1.0))
    top_seats = seats_opt.rank(acts, 100)[0].action.label
    top_maj = maj_opt.rank(acts, 100)[0].action.label

    assert top_seats == "steady", top_seats
    assert top_maj == "gamble", top_maj
    assert top_seats != top_maj
    print(f"test 6 (objective changes rec): PASS  max-seats->{top_seats}, max-majority->{top_maj}")



# 7. PayoffFunction selects the highest risk-adjusted payoff; DecisionEngine
#    returns "no clear best action" when the top-two gap is below kappa.

def test_payoff_risk_and_kappa():
    payoff = PayoffFunction()
    # X: higher mean, higher variance.  Y: lower mean, near-certain.
    rng = np.random.default_rng(0)
    x = rng.normal(10.0, 6.0, 5000)
    y = rng.normal(9.0, 0.5, 5000)

    risk_free = RiskConfig(lambda_risk=0.0, metric="std")
    risk_averse = RiskConfig(lambda_risk=1.0, metric="std")
    jx_free = payoff.score(x, risk_free)["J"]
    jy_free = payoff.score(y, risk_free)["J"]
    jx_av = payoff.score(x, risk_averse)["J"]
    jy_av = payoff.score(y, risk_averse)["J"]
    assert jx_free > jy_free          # risk-neutral prefers the higher mean
    assert jy_av > jx_av              # risk-averse prefers the safe option
    # picks highest risk-adjusted:
    assert max((jx_av, "X"), (jy_av, "Y"))[1] == "Y"

    # DecisionEngine kappa gate.
    def mk(label, J):
        return ActionScore(action=Action("status_quo", "A", label=label), J=J,
                           mean_utility=J, std_utility=0.0, lcb=J, ucb=J,
                           p_win_target=float("nan"), expected_seats=0.0,
                           p_majority=float("nan"), n_nonconverged=0)
    ranked = [mk("top", 10.02), mk("second", 10.00)]
    eng_strict = DecisionEngine(kappa=0.10)
    eng_loose = DecisionEngine(kappa=0.005)
    assert eng_strict.decide(ranked, ObjectiveWeights()).clear_best is False
    assert eng_loose.decide(ranked, ObjectiveWeights()).clear_best is True
    print("test 7 (risk-adjusted payoff + kappa gate): PASS")



def main():
    tests = [
        test_two_candidate_plurality,
        test_three_way_duverger_perfect_info,
        test_third_party_persists,
        test_seat_vote_bonus,
        test_withdrawal_helps_neighbour,
        test_objective_changes_recommendation,
        test_payoff_risk_and_kappa,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"{t.__name__}: FAIL -> {e}")
        except Exception as e:  # noqa
            failed += 1
            print(f"{t.__name__}: ERROR -> {type(e).__name__}: {e}")
    print("-" * 60)
    print("ALL PASS" if failed == 0 else f"{failed} test(s) failed")
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
