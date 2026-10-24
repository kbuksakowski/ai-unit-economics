# ADR-0006: Pricing source and versioning

- Date: 2026-08-31
- Status: Accepted, amended 2026-10-03

## Context

No provider exposes its price list programmatically, so the rate table must be maintained
by hand. The community dataset everyone uses is a rolling "latest wins" file, changed
several times a day, with no effective dates. It is a good source of current rates and a
wrong source of historical ones: one provider cut a model's price by 80%, and repricing an
older event against today's file understates it by that factor.

## Decision

Rates come from a **snapshot of the community dataset pinned by commit SHA**, vendored
into the repository. Never fetched from a moving branch at runtime.

The snapshot is **transformed at import** into our own effective-dated table:

```
provider, model, valid_from, rates...,
source, observedAt, effectiveAt, confidence
```

_Amended 2026-10-03:_ there is no stored `valid_to`. A row is valid until the next row
for the same model, so rows are only appended and intervals cannot overlap or leave gaps.

`confidence` is `EXACT` when the announcement date of a price change is known, and
`OBSERVED` when only our observation time is. Conflating those two produces exactly the
plausible-but-wrong figures this product exists to eliminate.

Pricing version identifier: `<provider>-<YYYY-MM-DD>-<short hash of the rate set>`. The
hash makes a version verifiable rather than merely descriptive.

Import is a script that produces a versioned data file in `packages/pricing-data`, never a
runtime lookup. _Amended 2026-10-03:_ originally "a script that produces a migration".
The goal — two processes started on different days cannot price the same event differently —
is met by a file pinned in the repository just as well; the risk was fetching at runtime, not
reading vendored data. Pricing becomes a pure function testable without a database, and a cost
fact records the `pricingVersion` it was computed with.

Pricing uses `respondedModel`, never `requestedModel`.

An unknown model yields `UNKNOWN_MODEL` and a visible "we do not know" figure — never
zero, never a silent null.

The upstream dataset is MIT licensed; attribution goes in `NOTICE`.

## Consequences

Two processes started on different days cannot price the same event differently, which is
possible with a runtime fetch and fails silently.

Effective dates must be maintained by us, because upstream has none. Known historical
changes have to be backfilled by hand from the upstream git history.

Multipliers compose and must be applied, not chosen between: cache write at 1.25x or 2x
by TTL, cache read at 0.1x, batch at 0.5x, data residency at 1.1x, and fast modes with
entirely separate rates. Until a variant has its rates in the table, it is reported as a
missing price component, never priced at the standard rate (ADR-0009).

## Alternatives rejected

**A maintained third-party pricing library.** Has the effective-dating primitive already,
but with one provider and a dozen models the temporal table is a table, not a project.

**Fetching the dataset at runtime.** Silently non-deterministic across time.

**Pricing on the requested model.** A provider repointing an alias to a differently priced
snapshot then misprices history with no signal at all.

**Returning zero for an unknown model.** Indistinguishable from a genuinely free call, and
it understates the bill — the one thing a cost product must never do.
