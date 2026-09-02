# Legacy Configuration Storage Retirement

This runbook controls the explicit removal of PostgreSQL storage that no current application reader or writer uses:

- `station_kv.value_json`;
- `station_settings.key`;
- `station_settings.value_json`;
- `job_queue` and its indexes.

The normal migration runner does **not** drop these objects. Migration `1266_legacy_config_storage_retirement_support.sql` creates only an operator audit ledger. The destructive statements run only through the explicit retirement command after a same-transaction safety check.

## Safety boundary

Retirement is allowed only when:

- migration `1263_configuration_ownership_guardrails.sql` is applied;
- migration `1266_legacy_config_storage_retirement_support.sql` is applied;
- `station_kv.value_json` has no meaningful values and no database dependencies;
- `station_settings.key` is nullable, has no populated values, and has no database dependencies;
- `station_settings.value_json` has no meaningful values and no database dependencies;
- `job_queue` is empty and has no database dependencies;
- all web, worker, and supervisor processes using an older application version are stopped;
- an external database backup has been completed and its reference is recorded.

The audit intentionally treats any populated `station_settings.key` row as a blocker. The value has no current canonical owner, so silently discarding it is unsafe.

## Preflight

Run the current application migrations, then inspect the site database:

```bash
npm run config:storage:audit
npm run config:storage:audit -- --require-safe
npm run config:storage:retire -- --require-safe
```

Review all reported rows and dependencies. The repository audit covers PostgreSQL views, materialized views, functions, and triggers. Operations must separately review external BI queries, support SQL, deployment scripts, and older binaries.

## Apply retirement

Use a maintenance window. Stop the application and workers before invoking the command from one controlled process:

```bash
npm run config:storage:retire -- \
  --apply \
  --maintenance-confirmed \
  --backup-reference "backup-or-snapshot-id" \
  --operator "operator-name" \
  --ack DROP_LEGACY_CONFIG_STORAGE
```

The command:

1. opens a database transaction;
2. sets bounded lock and statement timeouts;
3. takes a PostgreSQL transaction advisory lock;
4. reruns the complete audit inside that transaction;
5. records the backup reference, operator, application version, and pre-action audit;
6. drops the three legacy columns and the empty generic queue using `RESTRICT` semantics;
7. reruns the audit before commit;
8. commits only when `retirementComplete` is true.

Any failed assertion or database dependency rolls back the complete operation.

Verify the result:

```bash
npm run config:storage:audit -- --require-retired
```

## Compatibility-shell restore

The restore command recreates only nullable compatibility columns and an empty `job_queue` table. It does not restore historical values or queued jobs.

```bash
npm run config:storage:retire -- \
  --restore-compatibility \
  --source-run-id "retirement-run-uuid" \
  --operator "operator-name" \
  --ack RESTORE_LEGACY_CONFIG_STORAGE_COMPATIBILITY
```

This is suitable for correcting an application/schema mismatch in the current release. It is **not** a full older-binary rollback. Restoring historical data or returning to an application that depended on the removed values requires the external database backup referenced by the retirement run.

## Audit trail

`config_storage_retirement_runs` records:

- retirement or compatibility-restore action;
- status;
- operator and application version;
- external backup reference;
- maintenance confirmation;
- source retirement run for a restore;
- pre-action and post-action audits;
- bounded action details and timestamps.

The ledger stores no retired business payloads.

## Fresh installations

The historical baseline migration still creates the legacy objects because applied migration files are immutable and checksum-protected. A fresh installation therefore applies the full migration chain and then uses this runbook to retire the compatibility objects. A future schema-baseline squash may omit them entirely after all supported deployments have completed the retirement.

## Azure SQL

The active Azure SQL schema does not contain these PostgreSQL-only legacy columns or `job_queue`. No Azure destructive migration is required for this pass. Sync specifications already exclude the retired station-settings columns.
