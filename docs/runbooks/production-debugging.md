# Production Debugging

**Type:** runbook

Start with non-invasive evidence:

1. Check `/api/livez`, `/api/readyz`, and `/api/startup/status`.
2. Check process identity, process guard state, and worker heartbeats.
3. Review redacted application logs around the first failure.
4. Confirm database connectivity and migration state.
5. Inspect queue, lease, and retry state before restarting workers.
6. Capture a redacted support bundle when the relevant module provides one.
7. Reproduce with simulator or read-only validation where possible.

Do not dump the full environment, raw connection strings, session cookies, fiscal credentials, customer records, or private artifacts into tickets or chat systems.
