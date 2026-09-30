# Database read improvements

This change batches reads for organizer progress and both results views. It
does not change score writes, ranking rules, publication checks, or the schema.
Reads remain uncached so new submissions, exclusions and resets are reflected
on the next request.

## Query-count comparison

Measured with instrumented ORM fixtures against the previous implementation
at commit `e7e30cb`. The results fixture has 20 performers, 5 included judges,
100 submitted cards and one resolved tie.

| Operation | Before | After |
| --- | ---: | ---: |
| Organizer results panel | 104 | 5 |
| Public results page, including competition/publication lookup | 105 | 6 |
| Progress data, 5 judges | 12 | 4 |

Progress counts exclude the route's session, role and competition checks.
Empty inputs skip dependent queries. Results query count no longer grows with
performer/judge pairs or resolved ties. Progress query count no longer grows
with the number of judges. Independent reads run together in two stages.

Results fetch only score fields used in calculation, not private judge notes.
Progress fetches only judge names and submitted card identifiers. Both keep
database filters scoped to the requested lineup and assignments.

## Validation

- Tests cover query counts, empty inputs, drafts, exclusions, other competitions,
  tiebreak ordering, publication checks and progress updates after resets.
- Both results views produced identical rendered HTML before and after batching
  for the large fixture, exclusions, drafts, unresolved ties and empty lineups.
- Query counts are not production latency measurements. No production data was
  changed or synthetic load sent to the live service for this comparison.

## Index follow-up

The checked-in schema already declares indexes starting with `performerId` on
Scorecard, `tiebreakId` on TiebreakPerformer, `competitionId` on lineup/assignment
tables, and the User primary key. Batched card reads now filter by performer IDs
as well as assignment IDs; no index migration is included.

Before adding indexes, inspect the deployed indexes and run read-only
`EXPLAIN (ANALYZE, BUFFERS)` for representative queries during a quiet period.
Compare plans and timings at realistic competition sizes. A sequential scan on
a small table alone is not evidence that another index is needed.
