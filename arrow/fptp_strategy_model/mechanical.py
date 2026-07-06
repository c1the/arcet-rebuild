#Mechanical FPTP conversion and seats-votes diagnostics

from __future__ import annotations

from typing import Dict, List, Sequence

import numpy as np


class MechanicalSeatModel:
    def winners(self, district_shares: Sequence[Dict[str, float]]) -> List[str]:

        out = []
        for shares in district_shares:
            best = max(shares.items(), key=lambda kv: (kv[1], kv[0] is not None and kv[0]))
            # max on (share, name) breaks ties deterministically by name
            best_c = max(shares.items(), key=lambda kv: (kv[1], kv[0]))[0]
            out.append(best_c)
        return out

    def seat_counts(
        self, district_shares: Sequence[Dict[str, float]], candidates: Sequence[str]
    ) -> Dict[str, int]:
        seats = {c: 0 for c in candidates}
        for w in self.winners(district_shares):
            seats[w] = seats.get(w, 0) + 1
        return seats

    def national_vote_share(
        self, district_shares: Sequence[Dict[str, float]], candidates: Sequence[str]
    ) -> Dict[str, float]:
        tot = {c: 0.0 for c in candidates}
        for shares in district_shares:
            for c, v in shares.items():
                tot[c] = tot.get(c, 0.0) + v
        n = len(district_shares)
        return {c: tot[c] / n for c in candidates} if n else tot

    def gallagher_index(
        self, district_shares: Sequence[Dict[str, float]], candidates: Sequence[str]
    ) -> float:
 
        n = len(district_shares)
        if n == 0:
            return 0.0
        seats = self.seat_counts(district_shares, candidates)
        seat_share = {c: seats[c] / n for c in candidates}
        vote_share = self.national_vote_share(district_shares, candidates)
        sq = sum((seat_share[c] - vote_share[c]) ** 2 for c in candidates)
        return float(np.sqrt(0.5 * sq))

    # --- seats-votes curve, swing ratio, partisan bias (Tufte 1973) ------ #
    def seats_votes_curve(
        self,
        district_shares: Sequence[Dict[str, float]],
        party: str,
        other: str,
        swings: np.ndarray | None = None,
    ) -> Dict[str, np.ndarray]:
        if swings is None:
            swings = np.linspace(-0.25, 0.25, 51)
        base = []
        for shares in district_shares:
            p = shares.get(party, 0.0)
            o = shares.get(other, 0.0)
            base.append((p, o))
        base = np.array(base)  # (D, 2)
        n = len(base)

        vote_share, seat_share = [], []
        for sw in swings:
            p = np.clip(base[:, 0] + sw, 0, 1)
            o = np.clip(base[:, 1] - sw, 0, 1)
            seats = int(np.sum(p > o))
            seat_share.append(seats / n)
            tot = p.sum() + o.sum()
            vote_share.append(float(p.sum() / tot) if tot > 0 else 0.0)
        vote_share = np.array(vote_share)
        seat_share = np.array(seat_share)

        # Swing ratio = slope of seat share wrt vote share near 50%.
        mid = np.argmin(np.abs(vote_share - 0.5))
        lo, hi = max(0, mid - 3), min(len(vote_share) - 1, mid + 3)
        if hi > lo and vote_share[hi] != vote_share[lo]:
            swing_ratio = (seat_share[hi] - seat_share[lo]) / (
                vote_share[hi] - vote_share[lo]
            )
        else:
            swing_ratio = float("nan")
        # Partisan bias = seat share at 50% vote share minus 0.5.
        bias = float(np.interp(0.5, vote_share, seat_share) - 0.5)
        return {
            "vote_share": vote_share,
            "seat_share": seat_share,
            "swing_ratio": float(swing_ratio),
            "partisan_bias": bias,
        }
