# ADR-0010: Cost analytics and completeness figures

- Date: 2026-10-03
- Status: Accepted
- Related: ADR-0005, ADR-0009

## Context

A cost figure that cannot say what it leaves out is a figure nobody can act on. The
analytics have to report both, and must not make a partial number look complete.

## Decision

**Two read endpoints, behind the read-only key** (ADR-0005): `GET /v1/costs/summary` groups
current cost facts by customer or feature; `GET /v1/costs/overview` reports the totals for
the whole range. Both response shapes live in `packages/contracts`, so the API and the
dashboard cannot drift.

**`from` and `to` are always explicit**, `from` inclusive and `to` exclusive. A hidden
default range produces a figure that disagrees with an invoice for no visible reason.

**Only current `PRICED` facts enter an amount.** Every group also carries how many events it
covers and how many it left out. A group with nothing priced has `amount: null`, never zero.

**The overview has three separate gap figures**, not one score:

- **unattributed** — usage without a customer, with its priced amount and event count;
- **not priced** — measured but unpriced, with the reason and its size **in tokens**, never a
  guessed amount; tokens are null when the usage itself was unreadable;
- **not measured** — calls that reported no usage at all, such as streams.

Each points at a different fix: send a customer id, extend the price table, wait for stream
support. Merging them would say that something is wrong without saying what.

**Totals are computed in the database over the whole range.** The summary is capped at 500
groups (with `truncated: true` beyond); a total summed from a capped list would be too low.
Amounts are added as decimal money, per currency, never across currencies.

## Consequences

There is deliberately no single confidence score.

The summary does not page beyond 500 groups in this release.

The summary's `leftOutEvents` counts everything left out of the amount, streams included;
the overview separates not priced from not measured.
