# Leakage Checklist

Run this checklist on every case **after evidence collection and before forecasting**. Record the date, the person/agent who ran it, and the result in `lab_notes.md`. A case may not proceed to forecast with any unchecked item.

## Timestamps

- [ ] Every evidence item has both `event_time` and `knowledge_time` populated.
- [ ] No evidence item has `knowledge_time` after the forecast cutoff.
- [ ] Timestamps use ISO 8601 and, where time-of-day matters (cutoff day itself), include a timezone.
- [ ] For revised/republished sources, `knowledge_time` reflects the latest revision, not the original date.

## Sources

- [ ] No retrospective sources (memoirs, biographies, anniversary pieces, documentaries).
- [ ] No outcome-revealing summaries (Wikipedia, encyclopedia entries, "what happened" explainers).
- [ ] No source admitted without a verifiable publication/knowledge date.
- [ ] Every excluded source is logged in `data_manifest.csv` with its reason.
- [ ] Manually provided internal notes are flagged `manual` and carry an explicit `knowledge_time`.

## Content screen

- [ ] Evidence text has been read for implicit leakage: past-tense framing of the outcome, references to consequences, "as it turned out" phrasing.
- [ ] No evidence item quotes or embeds a post-cutoff source.

## Process

- [ ] `actual_outcome.json` is still in its placeholder state (outcome hidden) at forecast time.
- [ ] The forecast will be locked (written and hash/date-stamped) **before** the actual outcome is recorded.
- [ ] Researcher's own hindsight noted: if the researcher already knows this event's outcome, that is recorded as a limitation in lab notes.

**Result:** PASS / FAIL — with notes. A FAIL on any item blocks the forecast until resolved.
