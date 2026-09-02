# DOMS/JPL Support Bundle

The DOMS/JPL support bundle is a redacted JSON export for field support and commissioning investigations. It is available from the admin forecourt page and from:

```text
GET /api/admin/forecourt/support-bundle
```

Use `?inline=true` to preview the JSON shape in the browser/API client, or omit it to download an attachment.

## Included data

The bundle contains:

- Forecourt connection and protocol health summary.
- Adapter state, buffer health, last reject, last frame diagnostics, and recent frame diagnostics.
- Derived observability counters for reconnects, heartbeat/dead-connection timeouts, rejects, transaction read failures, transaction clear failures, stale locks, service-log backlog, and back-office-record backlog.
- Per-command latency summaries from recent `pos_commands` / `pos_command_results` samples.
- Redacted forecourt/JPL settings summary.
- Reconciliation summary and detailed read-only reconciliation state.
- Field-validation readiness state.
- Maintenance session and hard-disabled execution-gate state.
- Recent persisted forecourt events, JPL protocol samples, rejects, command history, and tank delivery checkpoints.

## Redaction policy

The export recursively redacts secret-bearing keys. Any key matching password, token, authorization, certificate, private key, PEM, PFX, API key, signature, routing key, or TRA `CERTKEY` semantics is replaced with `[REDACTED]`.

The support bundle is intended for troubleshooting without exposing live credentials or signing material. It must still be handled as operational data because it may contain station IDs, pump/tank IDs, timestamps, transaction state, and protocol fault details.

## Operational use

Use this bundle when support needs to inspect a site without shell access. The first review pass should check:

1. `observability.status` and the derived metrics.
2. `protocol.protocolHealth.issues` and the last frame/reject diagnostics.
3. `reconciliation.summary.unresolvedBlockingIssues`.
4. Recent JPL samples around the reported incident time.
5. Maintenance execution policy to confirm PSS writes remain disabled.

The bundle is diagnostic only. It does not execute DOMS/PSS commands and does not authorize PSS configuration writes.
