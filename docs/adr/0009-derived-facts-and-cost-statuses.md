# ADR-0009: Derived facts and cost statuses

- Date: 2026-10-03
- Status: Accepted, amended 2026-10-24 (`speed`, `service_tier`)
- Related: ADR-0002, ADR-0003, ADR-0006, ADR-0007

## Context

Ingestion stores what the SDK delivered. Cost has to be derived from it: normalise the
provider's usage, then price it. Two properties make this harder than it looks.

First, nothing in this system is updated in place — not an amount, not a status column. A
product whose promise is a trustworthy number cannot silently change a number it has
already shown.

Second, "unknown" must never become zero. An unknown model, a missing price component and a
call that reported no usage are different facts, and each must stay visible.

## Decision

**Three stages, each insert-only.** `usage_events` hold events exactly as delivered.
`usage_facts` hold usage normalised by one adapter version, unique per event and version.
`cost_facts` hold what a usage fact cost under one pricing version. A correction is a new
cost fact with `revision + 1` and `supersedes_id` pointing at the one it replaces; the
current value is derived as the fact nothing supersedes. A unique index on `supersedes_id`
keeps the history a single line.

**A background loop derives missing facts, not the ingestion request.** It picks events
without a usage fact, then usage facts without a cost fact, in batches. Replaying after an
adapter fix needs exactly this routine, so computing cost inside the request would be a
second path — and a bug there could lose an event. Unique indexes make the loop safe across
replicas: a duplicate insert is skipped. The same routine runs from a CLI.

**Every event gets a usage fact and a cost fact, each with a status.**

| Usage status         | Cost status               | Meaning                                       |
| -------------------- | ------------------------- | --------------------------------------------- |
| `NORMALIZED`         | `PRICED`                  | Every component priced                        |
|                      | `UNKNOWN_MODEL`           | The responded model is not in the price table |
|                      | `NO_RATE_FOR_PERIOD`      | Known model, event older than its first price |
|                      | `MISSING_PRICE_COMPONENT` | A variant or bucket without a rate            |
| `NOT_REPORTED`       | `NOT_MEASURED`            | No usage came back, e.g. a stream             |
| `UNRECOGNIZED_SHAPE` | `USAGE_UNRECOGNIZED`      | The usage object could not be read            |

**A partial total is withheld.** If any component lacks a rate, `amount` is null; the
priced components stay in `cost_details`. A partial sum would read as complete and
understate cost.

**Normalisation is strict.** An unknown key in the usage object yields `UNRECOGNIZED_SHAPE`:
it may be a new billable bucket from a newer provider SDK, and ignoring it would understate
cost. The raw object is kept, so a fixed adapter can reprice it. The cost of strictness is
real: when Anthropic added `speed` in 2026-10, every call was unrecognised until the adapter
learned it (normalisation version `anthropic-2`). Strictness stays, because `speed` itself
shows that even a text field can change the price; a lenient adapter would have priced fast
mode at standard rates without a signal.

**Variants without a rate are never priced at the standard rate.** _Amended 2026-10-24:_ `speed` and `service_tier` are read as allowlists too — any value other than the
known standard ones is a missing component. `speed: "fast"` (fast
mode, reported by Anthropic since late 2026-10) is a missing component until its rates are in
the table; `standard` or no `speed` is standard pricing. `inference_geo` values
`null`, `global` and `not_available` mean standard pricing — the last is what models without
region choice return, observed on the first real call. Any other value, such as `us`, the
priority tier, web search and code execution time are reported as missing components.

**Attribution is a status, not a precondition.** A fact without a customer carries
`attribution_status: UNATTRIBUTED` and is counted, never dropped.

**`core` receives the price table as an argument.** It depends on nothing, so it declares
its own rate shape; the API's typecheck proves `pricing-data` matches it.

## Consequences

Cost appears a few seconds after ingestion rather than in the response.

Every completeness figure is a count by status, with no separate bookkeeping.

Ingestion and derivation are tested against real MariaDB, locally and in CI: idempotency is
a unique index, and only the database can prove it holds.

Mass repricing after a price-table or adapter change is supported by the schema but not run
automatically in this release.
