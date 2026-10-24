# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.0] — unreleased

The first public release: cost per customer and per feature for Anthropic (Claude) calls,
self-hosted, with every gap in the numbers shown instead of hidden.

- **SDK** (`@ai-unit-economics/sdk`) wraps an Anthropic `messages.create` call and reports
  the usage object to your own API. Fail-open, zero runtime dependencies, Node 22.13+.
- **API** ingests events idempotently, derives usage and cost facts in the background, and
  serves cost summaries and a completeness overview behind a read-only key.
- **Pricing** from a dated price table for 21 Anthropic models, pinned to a commit of the
  LiteLLM dataset and checked against Anthropic's published prices in tests.
- **Dashboard** shows cost, unattributed, not priced and not measured usage, with cost per
  customer and per feature.
- **Docker demo**: `docker compose --profile demo up` runs everything with 300 example calls.

Known limitations are listed in the [README](README.md#known-limitations).
