# Production Debugging

**Type:** field runbook  
**Audience:** On-site support technicians, commissioning engineers, and technical support  
**Repository baseline:** `main` commit `03cc45e6bb7c09d01994f2d98743dfb346bfc520` (2026-09-11)

Use this runbook when an installed VPOS FTC station is degraded, partially unavailable, or producing incorrect operational results. Start with non-invasive evidence and isolate the failing boundary before restarting or changing configuration.

> **Field rule:** preserve evidence first. A restart can clear the symptom while destroying the timing, worker, queue, or protocol state needed to diagnose it.

## 1. First five minutes

Record before changing anything:

- station/site identifier
- controller model and installed VPOS package/version
- local date/time and timezone
- first known failure time and last known good time
- affected workflow, user role, pump/nozzle/tank, transaction, receipt, or print-job identifier
- exact UI/API error and `requestId` if present
- whether one device/workflow or the whole station is affected
- any deployment, reboot, network, PSS, pricing, fiscal, printer, or configuration change immediately beforehand

Then check, in this order:

```text
GET /api/livez
GET /api/startup/status
GET /api/readyz
GET /api/healthz
```

Do not interpret `/api/livez` as proof that the station is healthy. It proves only that the HTTP process is answering.

## 2. Classify the failure

Use the first matching category:

| Observation | Likely boundary | Go to |
| --- | --- | --- |
| `/api/livez` does not answer | process/package/service/port | §3 |
| livez answers, startup is not ready or is degraded | bootstrap/database/migration/import/runtime startup | §4 |
| readiness/health shows database failure | PostgreSQL/bootstrap | §5 |
| database healthy, JPL unhealthy or many pumps stale | DOMS/JPL/network/session | §6 |
| one pump/nozzle wrong, others healthy | mapping/device/local forecourt | §7 |
| transactions visible but fiscalization fails | proxy/fiscal lifecycle | §8 |
| receipt exists but print fails | printer/print queue | §9 |
| tank data missing/stale | ATG/JPL/tank mapping | §10 |
| UI/report dates or daily totals wrong | timezone/business-date/configuration | §11 |
| intermittent slowness/stale workers | worker/database/runtime pressure | §12 |

## 3. Process is not live

Check the site-standard service supervisor and capture the complete startup log. `start.cjs` emits:

- timestamp
- Node version
- platform and architecture
- PID/PPID
- working directory
- whether development env loading was skipped
- a redacted PostgreSQL URL signal
- uncaught exceptions, unhandled rejections, warnings, signals, and exit code

Verify:

1. correct CPB architecture package was installed
2. `start.cjs` exists
3. `vpos-server.cjs` exists
4. `src/platform/runtime/env-defaults.cjs` exists
5. service account can read required files and secure TLS/configuration paths
6. configured port is not already occupied
7. Node runtime is the supported Node 22 package runtime
8. no immediate uncaught exception/unhandled rejection is present

If the process repeatedly exits, do not enable `VPOS_KEEPALIVE=1` as a permanent fix. It is diagnostic only.

## 4. Startup is degraded or never reaches ready

Inspect `/api/startup/status` and the application log around the first failing phase. Startup includes:

1. environment defaults
2. process guard
3. console capture/startup status
4. database bootstrap and migrations
5. HTTP/HTTPS bind
6. Next.js preparation
7. optional legacy import
8. forecourt WebSocket setup
9. database-backed forecourt configuration
10. embedded runtime/workers

Typical causes:

- PostgreSQL unavailable
- migration failure
- legacy import failure
- secure TLS file missing/permission denied
- forecourt runtime initialization error
- invalid persisted configuration

A degraded startup after HTTP bind is intentionally observable. Fix the underlying phase; do not treat the startup page itself as the fault.

## 5. Database or migration failure

Capture:

- exact PostgreSQL error text
- SQLSTATE if logged
- table/constraint/migration name
- startup phase
- whether the failure began immediately after upgrade

Verify database connectivity from the controller using the approved support method. Confirm the service is running and the configured VPOS connection is correct.

Do **not**:

- edit `schema_migrations` by hand
- drop constraints or tables to make startup continue
- increase PostgreSQL pool size as a first response to pressure
- paste raw database connection strings into tickets/chat

If the error is migration-specific, compare the installed package version with the deployment baseline and escalate with the complete error. Follow the approved backup/rollback plan if the release cannot safely continue.

## 6. DOMS/JPL or station-wide pump failure

Symptoms include:

- many/all pumps stale or unavailable
- JPL health component not OK
- repeated connect/logon/reconnect messages
- transaction buffers not updating
- tank/wet-stock state stale at the same time

Check:

1. controller can reach the configured DOMS/PSS host
2. approved JPL TCP port is reachable
3. JPL host/port/POS ID/operation mode are correct
4. TLS requirements, server name, CA/cert/key paths are correct where enabled
5. only the expected VPOS/JPL session is using the site-assigned POS ID
6. heartbeat/dead-connection timing has not been changed outside the approved configuration
7. Forecourt Monitor/Diagnostics show a stable session rather than reconnect churn
8. configuration reconciliation does not show unexplained PSS/VPOS mismatches

Use the redacted support bundle when available:

```text
GET /api/admin/forecourt/support-bundle
GET /api/admin/forecourt/support-bundle?inline=true&limit=50
```

For an approved engineering environment, prefer the read-only live validator:

```bash
npm run doms:jpl-live:validate -- --host <pss-host> --port 8888 --profile full-readonly
```

Do not use price writes, maintenance commands, or dispenser control as a connectivity test.

For recovery sequencing and session-specific guidance, use [Forecourt recovery](forecourt-recovery.md).

## 7. One pump/nozzle/device is wrong

When other forecourt devices are healthy, do not restart the whole station first.

Check:

- physical dispenser/nozzle condition
- pump/nozzle identifier shown in VPOS
- PSS/DOMS identifier
- nozzle-to-tank mapping
- product/grade assignment
- pump mode/settings
- whether the problem began after topology/configuration work

Compare VPOS against the confirmed physical/PSS configuration. Do not repair a PSS configuration mistake by inventing a compensating VPOS mapping.

If changing a mapping is required, assess live transaction activity and use the approved change-control process.

## 8. Fiscalization or proxy failure

First decide whether the failure is local or downstream.

Check:

1. transaction exists in VPOS
2. transaction state and fiscalization state
3. receipt can be built/previewed
4. proxy health/configuration state
5. queued/pending/error information
6. exact error/request reference
7. country fiscal/device state where applicable

If many transactions fail from the same time, suspect proxy/cloud/fiscal-service connectivity before editing individual transactions.

Do not repeatedly resubmit the same fiscal request without understanding its current state. Preserve the original transaction ID.

### Tanzania-specific checks

For Tanzania, delayed transactions can legitimately use:

- invoice number / daily counter scoped to the originating transaction date
- Z number / invoice date scoped to the first fiscalization or pre-fiscalization assignment date

A difference between those dates is not itself corruption.

If receipt preview returns an internal error, capture the transaction ID and `requestId`. Do not recreate the customer or transaction first.

## 9. Receipt or printing failure

Determine whether the fault is receipt generation or physical printing.

If the receipt view itself fails:

- capture transaction ID and `requestId`
- confirm transaction/fiscal data exists
- investigate local receipt/fiscal assignment before the printer

If the receipt exists but paper does not print:

1. inspect **Print Jobs**
2. establish whether a job is queued, processing, failed, or completed
3. verify printer power/paper/device status
4. verify configured printer IP/port
5. verify controller-to-printer connectivity
6. retry only after the first job state is known

Do not repeatedly create duplicate print jobs as a printer test.

## 10. Tank/ATG data missing or stale

Check:

- JPL health/session first if multiple forecourt data types are stale
- configured tank identifiers and mappings
- whether ATG polling is enabled in Tank Settings
- configured polling interval
- last successful tank snapshot/refresh
- PSS tank-gauge visibility

The station uses persisted `GET_ALL_TG_DATA` results for ATG snapshots when polling is enabled. A mapping issue should not be hidden by a manual arbitrary stock adjustment.

## 11. Time, timezone, or reporting discrepancy

Do not change station timezone merely to make a report match an expected value.

Check:

- controller system time
- configured station timezone
- report/search filter timezone semantics
- transaction business date
- fiscal assignment date where applicable
- whether the discrepancy began after a timezone/configuration change

For Tanzania, daily counters and Z/invoice dates can intentionally belong to different date scopes for delayed transactions. Escalate with the transaction origin date and fiscal assignment date.

## 12. Runtime pressure, worker stale, or intermittent slowness

Readiness/health exposes required worker heartbeat state. If workers are missing or stale, capture that before restart.

Also inspect logs/metrics for:

- PostgreSQL waiting clients/pool pressure
- repeated JPL reconnect/reconciliation loops
- queue backlog/retry churn
- high-frequency worker skips/backpressure signals
- memory growth/repeated process restarts

The runtime intentionally limits JPL and persistence concurrency to protect foreground UI/API work. Do not raise concurrency or PostgreSQL pool settings to mask an unknown bottleneck without engineering review.

## 13. Safe diagnostic flags

The production wrapper supports temporary evidence collection:

| Variable | Meaning |
| --- | --- |
| `VPOS_DEBUG=1` | verbose debug logging |
| `VPOS_DUMP_ENV=1` | selected environment values, redacted by key class |
| `VPOS_HEARTBEAT_FILE=/path/file` | periodic process heartbeat JSON |
| `VPOS_HEARTBEAT_MS=<ms>` | heartbeat interval |
| `VPOS_KEEPALIVE=1` | diagnostic event-loop keepalive |
| `VPOS_TRACE_NET=1` | packaged network tracing helper |

Use a non-public writable path for heartbeat output. Remove temporary flags after evidence collection.

Do not log/dump:

- full environment
- raw connection strings
- database passwords
- session cookies
- fiscal credentials
- private keys
- customer records

## 14. When a restart is appropriate

A restart is reasonable when:

- evidence has been captured
- the failing boundary is known or the approved recovery procedure requires it
- active transactions and site operations have been considered
- the restart is permitted by the site change/support procedure

After restart, verify all of:

- `/api/livez`
- startup ready/degraded state
- `/api/readyz`
- `/api/healthz`
- JPL session stability
- pump/tank state
- worker heartbeats
- printer/fiscal path if they were affected

If the same failure returns, stop restart cycling and escalate with evidence.

## 15. Escalation package

Provide technical support with:

- station identifier and controller model
- installed package/version
- local timezone and incident time range
- first failure and last known good timestamps
- liveness/startup/readiness/health summary
- transaction/receipt/print-job/pump/tank identifiers
- API `requestId` values
- relevant redacted log excerpt starting before the first failure
- redacted forecourt support bundle where relevant
- configuration/reconciliation evidence where relevant
- actions already taken and their timestamps
- whether restart changed the symptom

Never attach raw secrets or unredacted production configuration.

## 16. Quick decision guide

| Symptom | First action | Avoid |
| --- | --- | --- |
| App page unreachable | check process/service and `/api/livez` | changing JPL config |
| Live but degraded | inspect `/api/startup/status` | repeated restart |
| All pumps stale | check JPL/network/session | remapping every pump |
| One pump wrong | inspect physical/PSS/mapping | station-wide restart first |
| Many non-fiscalized transactions | check proxy/fiscal health and first failure time | duplicate submissions |
| Receipt exists, no paper | inspect Print Jobs/printer connectivity | duplicate print requests |
| Tank data stale | check JPL + ATG settings | arbitrary stock adjustment |
| Report date mismatch | verify station timezone and date scope | changing timezone live |

## 17. Related documentation

- [Production installation and upgrade](production-installation.md)
- [Commissioning](commissioning.md)
- [Forecourt recovery](forecourt-recovery.md)
- [Technician Setup Guide](../manuals/TECHNICIAN_SETUP_GUIDE.md)
- [Configuration](../configuration.md)
- [Startup flow](../startup-flow.md)
