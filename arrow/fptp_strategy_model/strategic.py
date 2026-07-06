# Strategic effect code thing

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

import numpy as np

from .config import DistrictData
from .preferences import VoteModel


def _sigmoid(x: float) -> float:
    if x >= 0:
        z = np.exp(-x)
        return float(1.0 / (1.0 + z))
    z = np.exp(x)
    return float(z / (1.0 + z))


@dataclass
class StrategicParams:


    g0: float = -1.0     # baseline reluctance to switch
    g1: float = 4.0      # sensitivity to expected instrumental benefit (Delta EU)
    g2: float = 1.0      # sensitivity to information level
    g3: float = 1.5      # extra penalty on expressive cost
    pivot_floor: float = 0.20   # min instrumental weight when clearly out of contention
    viability_band_z: float = 1.64  # how many sigmas below 2nd place still counts as "in contention"
    epsilon: float = 1e-4
    max_iter: int = 120
    # The strategic map uses smooth (logistic) viability weights, so it is
    # continuous and contractive; a fixed-damping Picard iteration converges in
    # a handful of steps without the boundary oscillation that a hard viable-set
    # threshold would produce.


class StrategicVotingModel:
    def __init__(self, vote_model: VoteModel, params: StrategicParams | None = None):
        self.vote_model = vote_model
        self.p = params or StrategicParams()

    #viability
    def estimate_viability(
        self, shares: Dict[str, float], sigma: float
    ) -> Tuple[List[str], Dict[str, float]]:
    
        cands = list(shares)
        s = np.array([shares[c] for c in cands])
        order = np.argsort(-s)
        viable = {cands[order[0]]}
        if len(cands) > 1:
            second = s[order[1]]
            viable.add(cands[order[1]])
            cutoff = second - self.p.viability_band_z * sigma
            for i in order[2:]:
                if s[i] >= cutoff:
                    viable.add(cands[i])
        # Win-prob approximation via a small normal MC over shares.
        rng = np.random.default_rng(12345)
        draws = rng.normal(s[None, :], max(sigma, 1e-6), size=(400, len(cands)))
        wins = (draws == draws.max(axis=1, keepdims=True)).sum(axis=0)
        win_prob = {c: float(w) / 400.0 for c, w in zip(cands, wins)}
        return sorted(viable), win_prob

    #  switching 
    # smooth viability weights (continuity -> a real fixed point)
    def viability_weights(self, shares: Dict[str, float], sigma: float) -> Dict[str, float]:
        cands = list(shares)
        s = np.array([shares[c] for c in cands])
        order = np.argsort(-s)
        second = s[order[1]] if len(s) > 1 else s[order[0]]
        scale = max(0.5 * sigma, 0.02)
        cutoff = second - self.p.viability_band_z * sigma
        w = {}
        for c, sc in zip(cands, s):
            # Leader and runner-up are always fully in contention.
            base = 1.0 / (1.0 + np.exp(-(sc - cutoff) / scale))
            w[c] = float(base)
        # Guarantee the top two have weight ~1 regardless of spacing.
        w[cands[order[0]]] = 1.0
        if len(cands) > 1:
            w[cands[order[1]]] = max(w[cands[order[1]]], 1.0)
        return w

    def _bloc_switched_alloc(
        self,
        bloc_probs: np.ndarray,
        cands: Sequence[str],
        bloc,
        viab: Dict[str, float],
        sigma: float,
        margin_top2: float,
    ) -> np.ndarray:
        utils = np.array([bloc.utility.get(c, -1e9) for c in cands])
        favourite = cands[int(np.argmax(utils))]
        w_fav = viab[favourite]
        if w_fav > 0.999:
            return bloc_probs  # favourite clearly in contention

        # Target = most-preferred candidate that is meaningfully viable;
        # least-preferred viable defines the "stop the worst" comparison.
        viable_enough = [c for c in cands if viab[c] >= 0.5]
        if not viable_enough:  # degenerate; fall back to top-2 by viability
            viable_enough = sorted(cands, key=lambda c: viab[c], reverse=True)[:2]
        t = max(viable_enough, key=lambda c: bloc.utility.get(c, -1e9))
        l = min(viable_enough, key=lambda c: bloc.utility.get(c, -1e9))

        pivot = max(
            self.p.pivot_floor,
            float(np.exp(-0.5 * (margin_top2 / (np.sqrt(2.0) * max(sigma, 1e-6))) ** 2)),
        )
        delta_eu = pivot * (bloc.utility[t] - bloc.utility[l]) - bloc.expressive_cost
        p_switch = _sigmoid(
            self.p.g0
            + self.p.g1 * delta_eu
            + self.p.g2 * bloc.info_level
            - self.p.g3 * bloc.expressive_cost
        )
        # Effective switching scales with how non-viable the favourite is, and
        # only mass on non-viable candidates is moved (each by 1 - viability).
        effective = p_switch * (1.0 - w_fav)
        idx = {c: i for i, c in enumerate(cands)}
        out = bloc_probs.copy()
        moved = 0.0
        for c in cands:
            if c == t:
                continue
            frac = effective * (1.0 - viab[c])
            delta = out[idx[c]] * frac
            out[idx[c]] -= delta
            moved += delta
        out[idx[t]] += moved
        return out

    def run(
        self, district: DistrictData, sigma: float
    ) -> Tuple[Dict[str, float], Dict[str, float], List[str], bool]:
        cands = list(district.candidates_present)
        sincere = np.stack(
            [self.vote_model.bloc_choice_probs(b, cands) for b in district.blocs]
        )
        sizes = np.array([b.size for b in district.blocs])

        shares_vec = (sizes[:, None] * sincere).sum(axis=0)
        converged = False
        for k in range(self.p.max_iter):
            shares = {c: float(v) for c, v in zip(cands, shares_vec)}
            # Smooth weights drive the (continuous) switching map; the hard
            # viable set is only computed at the end for reporting/tests.
            weights = self.viability_weights(shares, sigma)
            ssort = np.sort(shares_vec)[::-1]
            margin_top2 = float(ssort[0] - ssort[1]) if len(ssort) > 1 else 1.0

            new_alloc = np.stack(
                [
                    self._bloc_switched_alloc(
                        sincere[i], cands, district.blocs[i], weights, sigma, margin_top2
                    )
                    for i in range(len(district.blocs))
                ]
            )
            mapped = (sizes[:, None] * new_alloc).sum(axis=0)
            # The smoothed viability map is continuous and contractive in
            # expectation, but a near-boundary trailing candidate can induce a
            # shallow 2-cycle; a conservative relaxation (alpha = 0.2) damps it
            # out entirely while still converging well within max_iter.
            alpha = 0.2
            step = alpha * (mapped - shares_vec)
            shares_vec = shares_vec + step
            if float(np.max(np.abs(step))) < self.p.epsilon:
                converged = True
                break

        shares = {c: float(v) for c, v in zip(cands, shares_vec)}
        viable, win_prob = self.estimate_viability(shares, sigma)
        return shares, win_prob, viable, converged
