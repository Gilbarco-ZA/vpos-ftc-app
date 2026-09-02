# Storage Retirement

**Type:** runbook

Use this procedure for legacy configuration columns, generic queues, duplicate parsed storage, or compatibility tables.

1. Run the relevant audit in report mode.
2. Resolve all unsafe or unknown consumers.
3. Verify current and rollback binaries against the proposed schema.
4. Back up canonical and legacy data.
5. Obtain maintenance-window approval.
6. Run the explicit retirement command with its safety gate.
7. Verify schema, application readiness, worker behavior, and representative workflows.
8. Retain the audit output and rollback decision externally.

A passing automated audit is necessary but not sufficient; site scripts, BI queries, older packages, and restore procedures must also be checked.
