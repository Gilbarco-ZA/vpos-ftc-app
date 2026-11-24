# Runtime and Workers

**Type:** authoritative

VPOS FTC can run background behavior inside the custom server, in the omnibus worker, or through focused worker entrypoints.

## Requirements

- Singleton work must use a lease, advisory lock, or equivalent ownership mechanism.
- Workers must publish heartbeat and failure information where operations can observe it.
- Poll loops require bounded delays and clean shutdown handling.
- Retried work must be idempotent.
- A worker must not depend on request-local state.
- Process topology changes must document which process owns each responsibility.

The embedded runtime is convenient for station deployments but increases coupling between web readiness and operational services. Dedicated workers should be used when independent restart or scaling is required.

## Embedded runtime resource controls

Heartbeat writes are coalesced per station and process for five seconds.
Status, connectivity, PID, restart count and error changes bypass the interval;
metrics are periodically sampled. Failed writes remain eligible for retry.
The policy does not manufacture heartbeats for stalled workers.

Print workers inspect due candidates before atomically claiming eligible jobs.
A failed printer destination is deferred in process memory (30 seconds by
default, configurable with VPOS_PRINTER_BACKOFF_SECONDS, bounded to 5–300).
Other destinations remain eligible. Unconfigured destinations are also
deferred without modifying the queued receipt. The connectivity monitor no
longer releases all scheduled station jobs on one printer's recovery.
Existing PROCESSING claims are not automatically replayed: confirm physical
delivery before operator reconciliation. If printing completes but marking
DONE fails, the claim is left for reconciliation.

Readiness reports 503 for dependency failures or bounded check timeouts.
JPL forecourt health is independent of POS backend selection.
