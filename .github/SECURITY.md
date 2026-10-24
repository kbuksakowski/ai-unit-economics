# Security

## Reporting a vulnerability

Email **oss@kamilbuksakowski.dev**, or use GitHub's private vulnerability reporting on this
repository. Please don't open a public issue for anything that could expose someone's data.

You should get a reply within a few days. This is a personal project, not a staffed one, so
there is no formal SLA — but reports about leaked data or crossed tenant boundaries are
looked at first.

## What this project promises

These decide what counts as a vulnerability.

- **The SDK never sends prompts, model output or your provider API key.** It sends the
  model name, the provider's usage object, the request id, timing, and the customer and
  feature labels you pass. Anything more leaving your process is a vulnerability.
- **The SDK never breaks your provider call.** A way to make it throw into, reject, block or
  alter the host application's call is a vulnerability, even if nothing leaks.
- **Projects are isolated.** One project's ingestion or read key must never read or write
  another project's data.
- **Keys are stored only as SHA-256 hashes.** The ingestion key (`aiue_live_…`) can only write
  usage; the read key (`aiue_read_…`) can only read costs. Either one working in the other's
  place is a vulnerability.
- **Recorded facts are never changed in place.**

## Not vulnerabilities

- The keys and password in the Docker `demo` profile (`aiue_live_demo_local_only`,
  `aiue_read_demo_local_only`, `demo` / `demo`) are public on purpose, for a local demo only,
  and every demo port is bound to `127.0.0.1`.
- Plain HTTP between the SDK, the API and the dashboard on a single machine. Across machines,
  run them behind HTTPS; the SDK reports `insecure_transport` otherwise.
