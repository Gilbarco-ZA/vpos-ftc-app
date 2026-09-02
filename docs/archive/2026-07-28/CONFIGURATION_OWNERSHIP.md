# Configuration Ownership

This document defines the current owner of station configuration and operational state. It is the compatibility contract for new configuration work and for retiring legacy generic storage.

## Current owners

| Data class                                       | Canonical owner                                                                | Notes                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Station business/runtime settings                | `station_settings` typed columns                                               | Do not add equivalent `station_kv` keys.                              |
| Current application/process/integration document | `station_config.config_json`                                                   | One current normalized document per station.                          |
| Plugin configuration                             | `plugin_configs.config_json`                                                   | Scoped by station, process type, and plugin.                          |
| Device configuration                             | `device_configs.config_json`                                                   | Scoped by station, device type, and device key.                       |
| Fiscal and EWURA configuration                   | `fiscal_config` / `ewura_config`                                               | Purpose-specific typed ownership.                                     |
| Small operational state without a typed table    | `station_kv.value`                                                             | Must use a registered key/prefix and pass value-size/type validation. |
| Deployment environment override                  | non-empty `process.env.NAME`, then `station_kv['env:NAME']`, then code default | Process environment is the final deployment/emergency override.       |
| PSS import/export source                         | `station_kv['pss.xml.raw']`                                                    | Raw XML remains authoritative while export is supported.              |
| PSS identifier translation                       | `station_kv['pss.xml.idMap']`                                                  | Required to map normalized IDs back to PSS IDs.                       |

## `station_kv` contract

`station_kv` is not a generic business-settings table. It is restricted to small station-scoped operational state, setup markers, approved environment fallbacks, synchronization cursors, integration metadata, leases/checklists, and compatibility data with an explicit migration plan.

All application writes pass through `src/platform/config/station-kv-policy.ts`.

The policy provides:

- key normalization and a 160-character key limit;
- explicit key/prefix ownership classification;
- key-specific value-type validation;
- UTF-8 JSON payload size limits;
- a strict mode that rejects unregistered keys;
- a compatibility mode that temporarily accepts bounded unregistered keys and logs the first write per process.

```env
# Default while existing site keys are inventoried.
VPOS_STATION_KV_POLICY_MODE=compatibility

# Enable only after `config:storage:audit` and station-key inventory are clean.
# VPOS_STATION_KV_POLICY_MODE=strict
```

Registered large-value exceptions are intentionally narrow:

- `pss.xml.raw`: string or null, maximum 8 MiB;
- `pss.xml.idMap`: object or null, maximum 2 MiB;
- `pss.xml.importSummary`: compact object or null, maximum 16 KiB;
- `pss.xml.parsed`: deprecated read/retention compatibility object, maximum 8 MiB; new imports do not write it;
- `env:*`: string or null, maximum 16 KiB;
- unregistered compatibility keys: maximum 16 KiB.

The database migration adds an 8 MiB absolute ceiling and a 16 KiB `env:*` ceiling. The application policy remains more restrictive for most owners.

## Environment precedence

For values resolved through the environment configuration API, precedence is:

1. a non-empty `process.env.NAME` value;
2. the station-scoped `station_kv` key `env:NAME`;
3. the caller's code default.

This order lets deployment configuration override persisted admin defaults without duplicating the same value in multiple typed tables. Environment-key names must use `env:UPPER_SNAKE_CASE`.

Forecourt runtime configuration now applies the same precedence. The legacy bare `JPL_REQUEST_DISPATCH_POLICY` key remains read-only compatibility input; new persisted values use `env:JPL_REQUEST_DISPATCH_POLICY`.

## Retirement candidates

The repository has no active reader or writer for:

- `station_kv.value_json`;
- `station_settings.value_json`;
- the generic `job_queue` table.

All active application writers to `station_settings.key` were removed in Phase 5A, and migration `1263_configuration_ownership_guardrails.sql` makes the column nullable and removes its uniqueness/index requirement.

Phase 5D adds a deployment-safe manual retirement command. Before removal, run:

```bash
npm run config:storage:audit
npm run config:storage:audit -- --require-safe
npm run config:storage:retire -- --require-safe
```

The audit reports:

- whether the candidate columns and table still exist;
- meaningful legacy-column values, including populated `station_settings.key` rows;
- oversized or unregistered KV rows;
- generic queue rows grouped by status;
- matching database views, materialized views, functions, and triggers;
- whether the Phase 5A guardrail and Phase 5D support migrations are installed;
- conservative `safeForDestructiveMigration`, `readyToApply`, and `retirementComplete` results.

The normal migration runner never performs the destructive drop. The explicit command requires a stopped/maintenance deployment, an external backup reference, an operator identity, and the exact acknowledgement phrase. It reruns the audit under an advisory lock in the same transaction, uses `RESTRICT` drop semantics, and commits only after a post-action audit confirms complete retirement.

A compatibility-shell restore can recreate nullable legacy columns and an empty queue, but it does not restore historical values. Full rollback requires the external database backup. See [`CONFIGURATION_STORAGE_RETIREMENT.md`](CONFIGURATION_STORAGE_RETIREMENT.md) for the operational procedure.

Configuration-version hashing, pinning, bounded retention, and PSS parsed-copy retirement are defined in [`CONFIGURATION_HISTORY_AND_PSS_STORAGE.md`](CONFIGURATION_HISTORY_AND_PSS_STORAGE.md).

## Rules for new work

1. Add a typed column or purpose-specific configuration table when the value is part of a business or integration contract.
2. Do not mirror a setting between `station_settings`, `station_config`, a plugin/device table, and `station_kv`.
3. Register a KV key or prefix before introducing a new write.
4. Do not store raw fiscal, payment, receipt, transaction, or controller payloads in KV.
5. Do not use `job_queue` for new work; use the purpose-specific queues and workers already present in the repository.
6. Keep `VPOS_STATION_KV_POLICY_MODE=compatibility` until every active station's unregistered-key count is understood.
