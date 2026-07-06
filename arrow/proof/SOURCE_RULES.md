# Source Rules

Every evidence item carries two timestamps:

- **`event_time`** — when the thing described happened.
- **`knowledge_time`** — the earliest moment the information was publicly knowable (publication date, broadcast date, release date).

Admission is decided on **`knowledge_time` versus the forecast cutoff**. If `knowledge_time` cannot be established, the source is excluded — no exceptions.

## Allowed

| Source type | Condition |
|-------------|-----------|
| Contemporaneous news reporting | Published before cutoff; original publication date verifiable |
| Official speeches and statements | Delivered/released before cutoff; use the transcript as contemporaneously published |
| Voting records | Votes cast and recorded before cutoff |
| Polling | Poll **released** before cutoff (release date, not fieldwork date, is the `knowledge_time`) |
| Public records | Registers, filings, official gazettes, Hansard-type records available before cutoff |
| Clearly dated internal notes | Only if manually provided, with an explicit `knowledge_time`, and flagged as `manual` in the manifest |

## Excluded

| Source type | Reason |
|-------------|--------|
| Post-event retrospectives | Written with knowledge of the outcome |
| Biographies and memoirs written later | Hindsight framing; outcome leakage |
| Wikipedia and other current summaries | Reveal or imply the outcome |
| Any article published after cutoff | `knowledge_time` violates the boundary regardless of content |
| Analysis whose `knowledge_time` is after cutoff | Includes updated/republished pieces — use the **latest revision date**, not the original date |
| Sources without a clear publication/knowledge date | Cannot verify the boundary |

## Edge rules

- **Revised articles**: if a pre-cutoff article was later updated and only the updated text is retrievable, it is excluded unless the pre-cutoff version can be recovered (e.g. from an archive snapshot dated before cutoff).
- **Quotes inside later sources**: a quote from before the cutoff found inside a post-cutoff source is still excluded — the surrounding text contaminates it. Find the original.
- **Every exclusion is logged** in `data_manifest.csv` with `status=excluded` and a reason. Exclusions are data too.
