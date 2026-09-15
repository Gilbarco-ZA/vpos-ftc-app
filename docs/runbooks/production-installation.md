# Production Installation and Upgrade

**Type:** field runbook  
**Audience:** On-site support technicians, commissioning engineers, and release engineers  
**Applies to:** packaged VPOS FTC releases for CPB-539 (`armv7l`) and CPB-579 (`arm64`) controllers  
**Repository baseline:** `main` commit `03cc45e6bb7c09d01994f2d98743dfb346bfc520` (2026-09-11)

This runbook covers installation and upgrade of the packaged `vpos-ftc-app` at a station. It deliberately does not invent controller package-manager commands: deployment and service-supervisor commands are owned by the approved site/controller packaging process. Record those commands in the site work order and use only the approved mechanism.

> **Production boundary**
>
> Do not clone the source repository and run `npm install`/`npm ci` on a production controller. Install the approved CI artifact for the controller architecture. Do not change PSS/DOMS, pricing, dispenser control, fiscal configuration, TLS verification, or production maintenance settings merely to make an installation pass.

## 1. Supported package shape

The production pipeline targets Node.js `22.15.0` and packages:

| Controller | Runtime architecture | Node runtime |
| --- | --- | --- |
| CPB-539 | `armv7l` | 22.15.0 |
| CPB-579 | `arm64` | 22.15.0 |

The packaged runtime requires, at minimum:

- `start.cjs`
- `vpos-server.cjs`
- `src/platform/runtime/env-defaults.cjs`
- the generated Next.js runtime and assets supplied by the CI package

`start.cjs` is the production entry point. It applies runtime defaults, installs process diagnostics, optionally writes a heartbeat file, and loads `vpos-server.cjs`.

## 2. Required information before arriving on site

The deployment work order must contain or link to:

- station/site name and station identifier
- country, currency, and station timezone
- controller model and CPU architecture
- currently installed VPOS version/package identifier
- approved target VPOS version/package identifier
- approved rollback package
- maintenance window and change reference
- DOMS/PSS host, JPL port, POS ID, and approved operation mode
- required TLS paths and server name when JPL TLS is enabled
- PostgreSQL service/connection ownership for the controller
- receipt/report printer endpoint
- approved `vpos-proxy` endpoint/routing details
- country-specific fiscal prerequisites, including Tanzania requirements where applicable
- local site contact and technical escalation contact

Do not arrive with only the package file and attempt to discover production configuration by trial and error.

## 3. Pre-installation checks

Before changing the controller:

1. Confirm the package architecture matches the controller (`armv7l` or `arm64`).
2. Confirm the controller date, time, and timezone are correct.
3. Confirm sufficient free storage exists for the new package and rollback copy.
4. Confirm PostgreSQL is running and the current VPOS instance can reach it.
5. Confirm network reachability to the production DOMS/PSS host and approved JPL TCP port.
6. Confirm printer and `vpos-proxy` addresses have not changed unexpectedly.
7. Capture the current package version and current process/service state.
8. Capture current `/api/livez`, `/api/readyz`, `/api/healthz`, and `/api/startup/status` results when the old version is still running.
9. Export or capture the approved configuration/commissioning evidence required by the site.
10. Ensure the rollback package and rollback procedure are available locally before stopping the existing version.
11. Ensure database backup/recovery requirements in the deployment procedure have been met.

If the existing station is already degraded, record that state before installation. Do not attribute a pre-existing fault to the new release later.

## 4. Configuration and secret handling

Production configuration precedence is:

1. non-empty process environment
2. approved persisted station `env:NAME` values
3. defaults from `src/platform/runtime/env-defaults.cjs`

Do not deploy a developer `.env` file as a production configuration mechanism. Secrets, database credentials, TLS key material, proxy credentials, and fiscal credentials must come from the approved secure deployment configuration.

TLS keys/certificates must be outside the public web root. Do not place them under `public/`.

For HTTPS, `VPOS_USE_HTTPS=1` requires explicit `VPOS_HTTPS_KEY_PATH` and `VPOS_HTTPS_CERT_PATH`.

## 5. Capture a rollback point

Before replacing the package, record:

- old package/version identifier
- package installation location
- service/supervisor name
- station configuration version/reference if available
- database backup/snapshot reference required by the change procedure
- current configuration hashes or exported configuration evidence where provided by the platform
- current forecourt/JPL readiness/support evidence
- exact time the old package is stopped

Do not manually edit `schema_migrations` as a rollback technique.

## 6. Install the package

Using the approved controller/site package mechanism:

1. Stop or quiesce the current VPOS application according to the site procedure.
2. Install the approved artifact for the correct architecture.
3. Verify the installed package contains the required runtime files listed in section 1.
4. Verify file ownership and executable/read permissions are correct for the service account.
5. Verify secure configuration and certificate/key paths are still accessible to that account.
6. Start the package through the approved service supervisor.
7. Record the deployment/start timestamp.

Do not manually copy selected JavaScript files from one build into another package. The runtime must remain an internally consistent CI artifact.

## 7. Observe first boot

Startup proceeds through database bootstrap/migrations, HTTP bind, Next.js preparation, optional legacy import, forecourt WebSocket attachment, database-backed forecourt configuration, and embedded runtime startup.

Expected observations:

- `start.cjs` logs Node version, platform, architecture, PID, working directory, and a redacted PostgreSQL signal.
- `/api/livez` can answer once HTTP is bound even while deeper startup is still in progress.
- `/api/startup/status` reports startup progression.
- A failure after HTTP bind can leave startup in a **degraded** state instead of terminating immediately.
- Database migrations are applied during bootstrap and recorded in `schema_migrations`.

A successful HTTP bind is not a production acceptance result.

## 8. Health checks

From an authorized station/support network client, verify:

```text
GET /api/livez
GET /api/startup/status
GET /api/readyz
GET /api/healthz
```

Interpret them as follows:

- `/api/livez` — HTTP process liveness only. It does not test PostgreSQL, workers, JPL, proxy, or printers.
- `/api/startup/status` — startup phase and ready/degraded progression.
- `/api/readyz` — component readiness, including database and configured runtime dependencies.
- `/api/healthz` — component health under the `health` property.

For readiness/health, inspect the component result rather than only the HTTP connection. Typical components include:

- database
- JPL and other configured integrations
- proxy fiscalization
- printer
- required worker heartbeats

If workers are reported missing/stale, or a configured dependency reports `ok: false`, treat the station as not yet accepted.

Operational endpoints expose runtime information and must be network-restricted according to the deployment security policy.

## 9. Forecourt/JPL verification

Before enabling or exercising production writes:

1. Sign in with an authorized administrator account.
2. Open **Forecourt Monitor** / the forecourt administration area.
3. Verify the configured JPL host, port, POS ID, operation mode, and TLS expectations.
4. Verify the JPL session is stable and not repeatedly reconnecting.
5. Confirm pump states are visible and current.
6. Confirm transaction-buffer visibility.
7. Confirm tank/wet-stock visibility where the site uses it.
8. Run configuration reconciliation and resolve unexplained VPOS/PSS mismatches.
9. Export the redacted support bundle before final sign-off when required.

Where an approved engineering environment has repository tooling, use the read-only validator rather than a control action as a connectivity test:

```bash
npm run doms:jpl-live:validate -- --host <pss-host> --port 8888 --profile full-readonly
```

Do not use a dispenser-control, maintenance, or price-write command as a connectivity probe.

## 10. Application setup verification

For a new station or approved recommissioning, follow the [Technician Setup Guide](../manuals/TECHNICIAN_SETUP_GUIDE.md). At minimum verify:

- site identity, country, currency, and timezone
- product and grade records
- tank records and tank/grade relationships
- pump/nozzle-to-tank mappings
- production JPL connection settings
- approved forecourt pricing
- printer connectivity and physical print output
- proxy/fiscal connectivity
- country-specific fiscal setup
- setup finalization state

For an upgrade of an already commissioned station, do not rerun setup or overwrite mappings simply because the setup wizard exists. Verify persisted values were retained.

## 11. Controlled production acceptance

Perform the site-approved acceptance workflow. Minimum evidence should include:

- liveness, startup, readiness, and health results
- stable JPL session for the agreed observation period
- expected pump/nozzle/tank topology
- live pump state changes
- transaction ingestion from DOMS/PSS
- transaction visibility in VPOS
- receipt preview/generation and physical printing
- fiscalization/proxy flow where applicable
- wet-stock/tank visibility where configured
- approved price values
- no unexplained repeated reconnect, worker-stale, migration, queue, or protocol errors

If a controlled fuel transaction is required, follow the station test-sale procedure and reconcile it afterward.

## 12. Reboot/restart persistence check

If the deployment procedure permits a controlled restart, verify after restart that:

- `/api/livez` returns
- startup reaches ready rather than remaining degraded
- `/api/readyz` and `/api/healthz` recover
- station/JPL configuration persists
- the JPL session reconnects once and stabilizes
- pump and tank state resumes
- required workers resume heartbeats
- printing remains available
- no migration/bootstrap error appears

Do not accept a deployment that works only until the first process restart.

## 13. Rollback triggers

Stop acceptance and follow the approved rollback process when any of the following cannot be resolved inside the deployment window:

- package will not start or repeatedly exits
- startup remains degraded because of an unresolved bootstrap/migration failure
- database compatibility issue blocks normal operation
- JPL session cannot establish or is unstable compared with the pre-install state
- pump/nozzle/tank topology is materially wrong after upgrade
- transaction ingestion is lost/duplicated or cannot be reconciled
- printing is unavailable with no safe workaround
- required fiscal/proxy flow is unavailable and the site cannot legally/operationally trade
- a critical security/configuration artifact is missing or invalid

Rollback does not mean manually reverting individual database migrations unless a specific, tested migration rollback procedure exists. Restore the approved package/data state according to the release/change plan.

## 14. Diagnostic flags for field support

The production wrapper supports diagnostic flags that may be enabled temporarily under change control:

| Variable | Purpose | Field rule |
| --- | --- | --- |
| `VPOS_DEBUG=1` | more verbose startup/debug logging | enable only while collecting evidence |
| `VPOS_DUMP_ENV=1` | logs a selected environment set with redaction | never substitute for secure secret inspection |
| `VPOS_HEARTBEAT_FILE=/path/file` | writes periodic process heartbeat JSON | use a writable non-public path |
| `VPOS_HEARTBEAT_MS=<ms>` | heartbeat interval | minimum enforced by runtime |
| `VPOS_KEEPALIVE=1` | keeps event loop alive for diagnosis | diagnostic only; not a production fix |
| `VPOS_TRACE_NET=1` | enables packaged network tracing helper | use only for a bounded support session |

Remove temporary diagnostic flags when the support session ends.

## 15. Installation handover record

Before leaving site, record:

- installed package/version and controller architecture
- installation and restart timestamps
- health/readiness result
- JPL/PSS validation result
- configuration reconciliation result
- printer test result
- proxy/fiscal result
- controlled transaction/receipt test reference
- support-bundle/readiness evidence reference if collected
- any warnings or accepted deviations
- rollback package location/reference
- manager training/sign-off status
- technician name and site representative sign-off

Link the completed commissioning evidence to the deployment/change ticket rather than storing secrets or raw production data in the repository.

## 16. Related documentation

- [Technician Setup Guide](../manuals/TECHNICIAN_SETUP_GUIDE.md)
- [Commissioning runbook](commissioning.md)
- [Production debugging](production-debugging.md)
- [Forecourt recovery](forecourt-recovery.md)
- [Configuration](../configuration.md)
- [Startup flow](../startup-flow.md)
- [Manager Training Guide](../manuals/MANAGER_TRAINING_GUIDE.md)
