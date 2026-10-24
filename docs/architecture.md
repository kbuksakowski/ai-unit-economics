# Architecture

> This document is a work in progress. It records decisions as they are made, rather
> than describing a finished system. Open questions are marked explicitly.

## Two streams of facts

The domain keeps historical facts, not current state. Nothing overwrites the past.

```
AI usage  ->  Usage Fact  ->  [pricing engine]  ->  Cost Fact
                                                        |
                                                        +->  cost per customer
                                                        |
provider cost report  ->  Billing Fact  ---------------->  invoice variance

Subscription  ->  Revenue Fact  ----------->  (after the first release)
```

The first stable release ends at a cost per customer that can be checked against what the
provider actually charged; this pre-release stops at the cost per customer. Revenue is modelled but not surfaced yet: nobody computes a
margin on a number they do not trust.

Usage and revenue are deliberately separate. A customer's price and their AI usage have
different lifecycles, and modelling revenue as a property of a usage event would tie
them together incorrectly.

## First deployment scope

Keep exact money, raw usage, normalisation versions, effective-dated pricing with
provenance and uncertainty, immutable facts and idempotency from the start. Initially
support the Anthropic models in the vendored price table; retain other usage as explicitly
unpriced rather than assuming support.

The fact model supports appending corrections from the start. Automated bulk repricing
and a dedicated correction screen are deferred; existing cost views still identify the
revision shown and disclose corrections. The first useful dashboard exposes cost per
customer and feature, unattributed usage and unpriced usage.

Validate against retained provider usage fixtures without secrets or response content,
including cache, missing usage, unsupported models or variants, duplicate delivery and
price boundaries. Expected costs must be computed independently of the pricing engine
from documented rates and rules, including when AI assists with implementation and tests.

## Package boundaries

| Package                 | May depend on          | Never depends on               |
| ----------------------- | ---------------------- | ------------------------------ |
| `packages/core`         | nothing                | NestJS, TypeORM, provider SDKs |
| `packages/contracts`    | schema validation only | `core`                         |
| `packages/sdk`          | `contracts`            | `core`, NestJS                 |
| `packages/pricing-data` | nothing                | everything                     |
| `apps/api`              | all packages           | —                              |
| `apps/dashboard`        | `contracts`            | `core`                         |

The `sdk` boundary is the strict one. It is installed into other companies' production
applications, so its dependency footprint is a product constraint, not a preference.

## Money

The domain type is `Money { amount, currency }` with a decimal amount, **never a floating
point number**. Inference costs run to seven or more decimal places, so fixed two-decimal
minor units are not sufficient either.

The current implementation in `packages/core` holds the amount as a scaled integer
(`bigint` units plus a scale). That is an implementation choice, not a domain requirement —
what the domain requires is exact decimal arithmetic.

The original amount and currency are always preserved. Currency conversion is out of
scope; combining different currencies throws.

## Pricing

Pricing rules are versioned data, not code. A cost fact records the pricing version used
to produce it, so a later provider price change cannot silently rewrite historical cost.

Every cost is computed from list prices; there is no provider-reported or custom pricing
yet.

## Fail-open telemetry

Reporting usage must never become a dependency of the host application's AI call. If the
ingestion API is unreachable, slow, or returning errors, the host application's call to
its provider must still succeed.

## Idempotency

Every event carries two SDK-generated UUIDv7s: `idempotencyKey` for the delivery and
`usageEventId` for the usage itself (ADR-0003). Ingestion deduplicates on a permanent
unique index over `(project_id, idempotency_key)` in `usage_events`, so the guarantee holds
across concurrent replicas. The same event delivered twice is stored once and therefore
priced once.

## Token accounting is provider-specific

The two major providers report cached tokens with opposite semantics. Getting this
wrong produces a bill that is silently wrong, which is the one failure a cost product
cannot have.

**OpenAI** — cached and reasoning tokens are _subsets_ of the totals, so they are
subtracted out before pricing the remainder:

```
fresh_input = input_tokens - cached_tokens - cache_write_tokens
cost = fresh_input*input_rate + cached_tokens*cache_read_rate
     + cache_write_tokens*cache_write_rate + output_tokens*output_rate
```

`reasoning_tokens` sits inside `output_tokens` and is charged at the output rate unless
the model overrides it.

**Anthropic** — cache tokens are _disjoint_ from `input_tokens`, so they are added:

```
total_input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

This normalisation belongs in the provider adapter. The domain must receive tokens that
already mean the same thing regardless of provider. The same rule is written into the
OpenTelemetry GenAI conventions, which state that `gen_ai.usage.input_tokens` includes
cached tokens and give the Anthropic conversion explicitly.

Cache discounts are not a fixed multiplier and must never be hardcoded — they vary by
model generation, and OpenAI now charges for cache _writes_ on newer models.

## Usage: canonical fields plus an extensible remainder

Token buckets change every quarter. OpenAI already reports cached, cache-write,
reasoning, audio, text and image tokens; Anthropic distinguishes 5-minute from 1-hour
cache writes. Fixed columns would mean a schema migration every time a provider adds one.

An open map alone is the wrong answer too: every ordinary query would drop into JSON
extraction and lose its typing. The shape is hybrid — the buckets that matter for every
provider are canonical, typed and indexable; the rest lives in a map.

```
NormalizedUsage
  inputTokens           canonical
  outputTokens
  cachedInputTokens
  details               Record<string, bigint>
  serviceTier, inferenceGeo, speed    properties that change the price
```

Three things are stored, not one:

```
rawProviderUsage       the provider's usage object, exactly as received
normalizedUsage        the result of running it through the adapter
normalizationVersion   which adapter version produced it
```

This matters more here than in most systems. Accuracy is the product, adapters will have
bugs, and the comparable tools' issue trackers are full of them. Keeping the raw object
means a normalisation bug can be replayed and corrected from stored data, rather than
requiring the customer to re-collect usage that no longer exists.

## Pricing is effective-dated, and priced on the response model

Two independent ways to get historical cost wrong, both observed in the wild:

**Prices change.** A provider can cut a price by 80% overnight. Repricing an old event
against today's rates understates it by that factor. The community price data everyone
uses (litellm) is a rolling "latest wins" file with no effective dates, changed several
times a day. It is a fine source of _current_ rates and a wrong source of _historical_
ones.

So the pricing table is effective-dated: `(model_id, valid_from, rates...)`, where a row is
valid until the next row for the same model — half-open intervals with no stored end, so
rows are only appended. It is looked up as of the event timestamp. `valid_from` is stamped
by us when a snapshot is imported, because the upstream data cannot supply it. The table is
versioned data in `packages/pricing-data`, not a database table (ADR-0006).

**Aliases move.** A bare model id such as `gpt-4o` is a pointer that providers silently
repoint to a newer, differently priced snapshot. An event recorded under the alias
cannot be priced correctly after the repoint.

The mitigation: **price on the model returned in the response, not the model requested**,
and store both. A repoint then shows up as an ordinary new model id rather than a silent
mispricing.

Prices also need provenance, because we stamp the dates ourselves. Three fields, not one:
`effectiveAt` (when the provider's price actually changed), `observedAt` (when we noticed)
and `source`, plus a confidence marker for when the announcement date is unknown.
Collapsing these produces exactly the plausible-but-wrong numbers this project exists to
eliminate.

A price change and a price correction are different operations, but **neither mutates a
cost fact — not even a status column**. A change adds a new effective-dated row and leaves
history untouched. A correction writes a new revision that _points back_ at what it
replaces:

```
CostFact  id=c1  rev=1  $0.042  pricingVersion=P17  supersedes=null
CostFact  id=c2  rev=2  $0.031  pricingVersion=P18  supersedes=c1
```

Row `c1` is never touched after insertion. "Current value" is **derived** — the fact that
nothing supersedes. "What did we believe on 12 August" is a filter on insertion time. No
column ever changes.

Marking the old row as superseded would be a smaller mutation, but still a mutation, and
the guarantee has to be absolute to be worth anything. For a product whose promise is
trustworthy numbers, silently changing a number already shown is disqualifying. None of the
tools we surveyed distinguishes these, which is why none of them can reprice correctly.

## Attribution is a status, not a precondition

A usage event without a customer id is still a real cost. If the customer id were
required, the "unattributed" figure would be structurally zero — and that figure is one of
the completeness metrics the product is built around.

So the field is optional at ingestion and the fact carries `attributionStatus`
(`ATTRIBUTED` / `UNATTRIBUTED`). The SDK keeps the field optional and the dashboard shows the
unattributed figure at the top; the backend must never discard good usage because business
context was missing.

Same rule as pricing, applied to a different dimension: unknown is neither zero nor a
reason to drop the event.

## Unpriced usage is recorded, never dropped and never zero

When a model is not in the pricing table, the usage fact is still stored with its raw
token counts, and the cost fact carries an explicit status rather than a number; the full
list is in ADR-0009.

Returning zero is the worst option, being indistinguishable from a genuinely free call.
Rejecting the event is also wrong, because the token counts are unrecoverable once lost.
Recording the gap keeps it visible in the dashboard and backfillable later, which works
only because the event timestamp and pricing version were stored alongside.

## Cost is not only tokens

Verified against Anthropic's current documentation, 2026-08-28. Three charges are billed
but never appear in the response `usage` object at all:

- **Code-execution container time** — billed per hour after a monthly free allowance. The
  response returns a container id and expiry, but no duration and no cost.
- **Managed agent session runtime** — billed per session-hour.
- **Compaction tokens** — the server-side summarisation pass. On the beta endpoint these
  surface under `usage.iterations` with `type: "compaction"`, and the documentation states
  they are _not_ included in the top-level usage fields. On the GA endpoint there is no
  visibility at all.

Server-side tools are billed per call rather than per token, and the response carries only
a _count_ — applying the rate is the caller's job.

The consequence for the domain: a Cost Fact derived purely from a Usage Fact is complete
for plain inference and incomplete for anything using server tools, code execution or
compaction. That gap must be visible rather than silently absent, which is what the
reconciliation path below is for.

## One request can be billed across several models

`usage.iterations[].model` exposes what actually ran: an advisor sub-inference, a
compaction pass, or a fallback hop after a refusal — each potentially a different model,
billed at that model's rates.

Attributing a request to the single model named in the request is therefore wrong for
those cases. Not handled yet: a usage object with `iterations` is recorded as unreadable
(not priced) rather than priced on one model.

## Bill coverage, as an optional proof layer

Providers expose administrative usage and cost reporting. Anthropic's cost report returns
real billed amounts, and its usage report goes down to per-API-key granularity within
minutes.

This makes a stronger claim possible than "we estimate your cost" — but a narrower one
than "our number matches your bill", which cannot be delivered. The claim is coverage: how
much of the provider's bill is explained by attributed usage, with the remainder itemised
rather than hidden.

```
provider bill = attributed cost
              + usage recorded without a customer
              + billing lines we do not model (containers, agent sessions, compaction)
              + unexplained residual
```

A homegrown script summing tokens can never tell its author whether its numbers are right.

This layer is **optional**. The first release imports a cost report supplied manually
by the user; the product does not receive an administrative provider credential.
Direct Admin API integration, credential management and scheduled synchronisation are
deferred. First value is cost per customer from the SDK; the optional second value is
bill coverage from the imported report.

Constraints that shape the design:

- The cost report is daily and groups only coarsely; the usage report is finer-grained but
  returns tokens, not money.
- Amounts come back in minor units as decimal strings — parse as decimal, never as float.
- Field naming differs between the reporting API and the inference API for the same
  quantity, so a mapping layer is required.
- The user obtains the report in their own provider environment. Import records its
  provenance, period, currency and account/workspace scope so comparison uses the same
  boundaries as telemetry. Matching totals do not establish correct customer attribution.

The practical shape: attribute per customer from our own telemetry, roll up to whatever
grain the provider's reporting exposes, and compare. Manual report reconciliation is
planned as a separate milestone (M3 in the README roadmap), after cost attribution and
completeness metrics. Record the provider-side identifiers needed to align the reporting
scope.

## Tokenizer changes break historical comparison

A provider can change its tokenizer between model generations. Anthropic's documentation
records one such change producing roughly 30% more tokens for the same text at unchanged
per-token rates.

A cost comparison spanning that boundary shows a rise that is an artefact of counting, not
of behaviour. Any period-over-period view must be able to mark that discontinuity rather
than present it as a real increase.

## Capture the provider's request identifier

Provider responses carry identifiers — a request id, and for Anthropic the workspace the
credential resolved to. They cost nothing to capture and are the only join key back to the
provider's own billing and support records. Only the request id is captured today.

## Ingestion contract

Shaped by what comparable products got wrong.

- **Versioned path** (`/v1/usage`). With self-hosting, a customer's SDK will routinely be
  newer than their server; without a version axis the only remaining lever is an
  environment flag, which is where one comparable product ended up.
- **Batch envelope from the first release**, a named object rather than a bare array, so
  request-level fields can be added later and so SDK-side buffering does not change the
  wire format.
- **Per-event results**, not all-or-nothing. One malformed event must not discard a batch.
- **Unknown top-level fields are ignored, not rejected**, so a newer SDK keeps working
  against an older server.
- **Events failing validation are stored with the error attached**, not dropped.
  Invisible lost usage is the worst failure mode for a billing-adjacent tool.
- **Three timestamps**: the client's event time, the receipt time and the storage time.
  Query by event time, debug by receipt time.
- **Idempotency key is separate from the business id**, and the timestamp is never part
  of the deduplication key — otherwise a retry that recomputes the timestamp becomes a
  second billable event.

## SDK wrapping is harder than it looks

Notes for stream support (M5 in the README roadmap), gathered from reading how four
comparable libraries do it.

- **Streaming usage may require an opt-in.** With OpenAI Chat Completions, usage is
  absent from a stream unless `stream_options.include_usage` is set. Every comparable
  library reads `chunk.usage` and reports zero when it is missing, without warning.
- **A `Proxy` around the stream object is not sufficient.** `.tee()` and
  `.toReadableStream()` reach private internals and bypass it. Mutating the returned
  object in place, plus overriding `tee()` to instrument the branches it returns, is what
  actually covers every consumption path.
- **Wrap the returned promise with the SDK's own `_thenUnwrap`** rather than rebuilding a
  facade; rebuilding breaks `instanceof` or makes the request lazy.
- **Close instrumentation in `finally`.** Two comparable libraries leak spans when the
  caller breaks out of a stream early or the promise rejects.
- **Telemetry failures are swallowed.** Nothing this SDK does may reach the host
  application as an exception.
- **Every module's declarations ship, not only the entry point's.** An exported function
  whose signature names a type from `contracts` leaks `zod` into the consumer's types.
  A test over the built `dist` guards this (ADR-0008).

## Inside `apps/api`

Two layers with a one-way dependency: `business-layer/` (modules, controllers, services)
imports `data-access-layer/` (entities, repository services), never the reverse. The data
layer's invariants — insert-only facts, `projectId` as the first argument of every
repository method, projections on reads — live in `apps/api/src/data-access-layer/INVARIANTS.md`.
Ingestion stores the event as delivered in `usage_events`; normalised usage facts are
derived from it, never written in its place. A background loop — not the ingestion request —
derives the missing facts: every event gets a usage fact and a cost fact, each with a status,
and a cost fact carries an amount only when every component was priced (ADR-0009).

## Open questions

Resolved so far: SDK public API (ADR-0008), ingestion contract and event identity
(ADR-0002, ADR-0003), authentication and tenant isolation (ADR-0005), pricing source and
versioning (ADR-0006), where normalisation happens (ADR-0007), usage and cost facts (ADR-0009), analytics (ADR-0010), the dashboard (ADR-0011). Still open:

- streaming interception, and whether to inject `stream_options.include_usage` for OpenAI (M5)
- batching, buffering, retry limits, shutdown flush semantics (M4)
- retention policy (post-v0.1)

## Decision records

Technical decisions are recorded in [docs/adr](adr).
