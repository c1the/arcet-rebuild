# Arcet Frontend Status

## Current milestone

**Arcet GIS War Room v0.3 — real constituency GIS + GE2024 competitiveness overlay + mapped live risk/action overlays.**

- Final demo checkpoint: `frontend/index-gis-warroom-v0.3-demo.html`
- Source checkpoint: `frontend/index-map-overlay-phase3b-checkpoint.html`
- Frontend: `http://localhost:5500`
- Backend: `http://localhost:3000`
- Verified: 2026-07-03

The final demo checkpoint is a byte-identical copy of the verified Phase 3b checkpoint. `frontend/index.html` is a separate working file and was not modified while creating this final checkpoint.

## Exact run commands

Terminal 1 — backend:

```powershell
cd "C:\Users\humph\OneDrive\Documents\arcet2\platform\Candidate Intelligence\Candidate Intelligence"
npx tsx server.ts
```

Terminal 2 — frontend:

```powershell
cd "C:\Users\humph\OneDrive\Documents\arcet2\frontend"
npx serve -p 5500 .
```

Open the final demo:

```text
http://localhost:5500/index-gis-warroom-v0.3-demo.html?v=gis03
```

If an old fictional map appears, close stale Arcet tabs and hard-refresh with `Ctrl+Shift+R`.

## 60-second demo script

1. **Load:** confirm `All constituencies · 650 seats`; Bristol Central is selected with GE2024 data and `· LIVE`.
2. **Layers:** open Layer Manager. Toggle or reduce **Competitiveness / risk** to show the static majority-based overlay blending back to neutral without removing boundaries.
3. **Bristol Central:** show its medium live-risk ring, action badge `4`, and linked Northbridge context.
4. **Hendon:** search `Hendon`; show the majority of 15, low-risk ring, no action badge, and linked Easthaven context.
5. **Bootle:** search `Bootle` or `E14001113`; show the medium-risk ring, action badge `1`, and linked Westfield context.
6. **Unmapped seat:** select Aldershot or another unmapped real seat; it retains static GE2024 competitiveness but has no LIVE indicator, ring, or badge.
7. **Graph/War Room:** return to Bristol Central, choose Graph Investigation to root on Northbridge, then choose War Room. Finish with **Reset layout**.

## Static competitiveness

All classifications use GE2024 `majorityPct`; they are not party colours and are not live backend risk:

| Band | Threshold | Seats |
|---|---:|---:|
| Very marginal | `< 2%` | 45 |
| Marginal | `2–<5%` | 68 |
| Competitive | `5–<10%` | 108 |
| Safe | `≥ 10%` | 429 |
| **Total** |  | **650** |

## Mapped seats and live counts

Live overlays use `Entity.metadata.gssCode` plus:

- `GET /api/entities/:id/risks`
- `GET /api/entities/:id/actions`

Resolved/dismissed risks and completed/dismissed actions are excluded.

| Real map seat | GSS code | Backend context | Active risks | Active actions |
|---|---|---|---:|---:|
| Bristol Central | `E14001131` | Northbridge | 3 medium | 4 |
| Hendon | `E14001279` | Easthaven | 1 low | 0 |
| Bootle | `E14001113` | Westfield | 1 medium | 1 |

The map-facing identity always remains the real constituency. Risk rings and action badges use separate pointer-transparent SVG groups, so seat hover and click behavior is unchanged.

## Fallback behavior

- **Backend offline:** the 650-seat map, GE2024 enrichment, and static competitiveness remain; LIVE context, risk rings, and action badges disappear without stale elements or crashes.
- **Unmapped real seat:** static GE2024 competitiveness only; no fabricated live overlay.
- **GIS asset missing or invalid:** the original 12-seat fictional mock map remains available.
- **Intel asset missing or invalid:** real geometry remains neutral with placeholders; mapped live overlays may still render when the backend and GSS lookup are available.
- **Partial live request failure:** successful mapped-seat responses render independently; failed risk/action responses remain empty.

## Known limitations

- Only Bristol Central, Hendon, and Bootle have verified GSS-linked live overlays.
- Live overlay values are load-time snapshots; there is no polling or push refresh.
- Static competitiveness is not live risk and does not use winning-party colours.
- Live signals/actions are not spatially joined across all 650 constituencies.
- Timeline Replay, Evidence, and Arrow remain static or placeholder surfaces.
- Action controls remain demo placeholders and do not mutate the backend.
- The backend and Postgres must be started manually for LIVE context.

## Next recommended phases

1. Expand GSS mappings only from verified identifiers; never infer constituency mappings from names.
2. Add automated smoke coverage for the final demo file, overlay counts, controls, mapped/unmapped flows, fallbacks, presets, and Reset Layout.
3. Define an explicit read-only refresh or polling policy for live map overlays.
4. Harden the general entity-search pagination contract.
5. Treat Arrow, Timeline, Evidence, and any write actions as separate approved phases.

