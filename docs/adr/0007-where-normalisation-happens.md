# ADR-0007: Where usage normalisation happens

- Date: 2026-08-31
- Status: Accepted, amended 2026-10-24
- Related: ADR-0002, ADR-0009

## Context

Providers report token usage with incompatible semantics. OpenAI treats cached and
reasoning tokens as subsets of the input and output totals, so they must be subtracted
before pricing the remainder. Anthropic treats cache tokens as disjoint from the input
total, so they must be added. Getting the direction wrong produces errors of the size
currently sitting open in comparable products' issue trackers: 2.5x, 2x, 1.9x, some for
over a year.

Converting a provider's raw usage object into a comparable shape is therefore the most
error-prone step in the system. The design question is not whether we will get it wrong —
everyone else has — but what happens when we do.

### Deployment model, because it constrains the answer

This product is self-hosted. The customer installs the SDK into their application and runs
the API, database and dashboard themselves:

```
customer's application ──(SDK, npm)──▶ customer's own API ──▶ customer's own database
       │
       └──────────────────────────────▶ AI provider, directly, never through us
```

So there is no "we deploy a fix" in the self-hosted case. A fix always requires the
customer to upgrade something: either the npm package inside their production application,
or the container image of a service that is not on their critical path.

An earlier draft of this ADR argued that server-side normalisation lets us deploy
corrections ourselves. **That was wrong for a self-hosted product** and is withdrawn. The
real argument is different and stronger.

## Decision

**The SDK sends the provider's raw usage object without interpreting it. Normalisation
happens on the server.**

The SDK contributes only what the server cannot infer: `provider` and
`providerSdkVersion`. _Amended 2026-10-24:_ the version travels inside
`providerClient: { name, version? }` (ADR-0002), and the SDK leaves the version empty today
because it cannot read it without importing the provider SDK.

`normalizationVersion` records which version of the server computed a given normalised
form.

## Consequences

The decisive property is not who upgrades. It is **whether the raw object reaches storage**:

```
SDK normalises, sends only results
  bug found ▸ fixed ▸ new events correct ▸ historical events WRONG PERMANENTLY
                                            the raw object never arrived; there is
                                            nothing left to recompute from

SDK sends the raw object
  bug found ▸ fixed ▸ new events correct ▸ historical events CORRECTED
                                            recomputed from stored raw usage
```

Storing the raw object was decided precisely so that a normalisation bug can be
replayed. Normalising in the SDK would make that stored data useless: we would hold the
inputs and lack the ability to reprocess them, because the numbers were already collapsed
before transmission.

For a product whose entire claim is a figure you can trust, the difference between a
correctable defect and a permanent one is the difference between the product working and
not.

Secondary, smaller, same direction: upgrading a container is cheaper and less risky for the
customer than upgrading a dependency inside the process that serves their traffic.

The SDK also gets smaller, which serves the constraint in ADR-0004.

Costs accepted:

- Payloads carry the full usage object rather than a reduced form. A few hundred bytes.
- The server must recognise the usage shapes of every supported provider, including those
  produced by provider SDK versions newer than itself. It must therefore treat an
  unrecognised shape the way it treats an unknown model: record it, mark it, never guess
  and never zero. Settled in ADR-0009.

## Alternatives rejected

**Normalise in the SDK.** What the comparable products do, and the reason their adapter
bugs cannot be repaired retroactively. Note that an SDK could normalise _and_ send the raw
object, which would preserve reprocessing — but then the SDK-side computation earns
nothing while still shipping provider-specific logic on the customer's upgrade cycle.

**Normalise in both and compare.** Would detect drift, but doubles the surface that can be
wrong and needs a policy for disagreement. Not worth it before there is evidence it is
needed.

## Note on a future managed deployment

If a hosted offering ever exists, the withdrawn argument becomes true there: we would
deploy the fix and the customer would do nothing. That is a hypothesis, not a plan, so
this decision does not rest on it.
