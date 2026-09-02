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
