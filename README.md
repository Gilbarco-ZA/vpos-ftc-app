# VPOS FTC App

A Next.js 13 + Node.js operations console for fuel-station transaction capture, fiscalization, forecourt integration, reporting, and station administration.

This repository combines three concerns in one codebase:

1. **The web UI** built with the Next.js App Router.
2. **A server-side API surface** under `app/api/**` for station operations, setup, diagnostics, and device control.
3. **Background runtime workers** for queue processing, forecourt synchronization, printing, reporting, proxy sending, and runtime supervision.

The app is designed to support station operations end to end: customer capture, transaction lifecycle management, fiscalization workflows, receipt printing, pump/tank administration, and operational diagnostics.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the technical architecture. Tanzania fiscalization routing/parity/security/output notes are in [`docs/tanzania-fiscalization-routing.md`](./docs/tanzania-fiscalization-routing.md), [`docs/tanzania-fiscalization-parity-matrix.md`](./docs/tanzania-fiscalization-parity-matrix.md), [`docs/tanzania-secure-artifacts.md`](./docs/tanzania-secure-artifacts.md), [`docs/tanzania-output-simulator.md`](./docs/tanzania-output-simulator.md), [`docs/tanzania-parity-validation.md`](./docs/tanzania-parity-validation.md), [`docs/tanzania-cloud-cutover.md`](./docs/tanzania-cloud-cutover.md), [`docs/doms-support-bundle.md`](./docs/doms-support-bundle.md), [`docs/doms-mapping-bulk-remediation.md`](./docs/doms-mapping-bulk-remediation.md), [`docs/doms-commissioning-readiness.md`](./docs/doms-commissioning-readiness.md), [`docs/doms-transaction-recovery.md`](./docs/doms-transaction-recovery.md), [`docs/doms-unattended-receipt-capture.md`](./docs/doms-unattended-receipt-capture.md), [`docs/doms-wetstock-normalization.md`](./docs/doms-wetstock-normalization.md), [`docs/doms-wash-transaction-capture.md`](./docs/doms-wash-transaction-capture.md), [`docs/doms-optional-module-runtime.md`](./docs/doms-optional-module-runtime.md), [`docs/doms-field-validation-release-gate.md`](./docs/doms-field-validation-release-gate.md), [`docs/doms-dynamic-tank-data-governance.md`](./docs/doms-dynamic-tank-data-governance.md), and [`docs/doms-operational-readiness.md`](./docs/doms-operational-readiness.md).

## What the app does

Based on the current route map and module layout, the application supports:

- **Role-based station operations** for tenant, manager, and administrator users.
- **Transaction capture and fiscalization** including pending, non-fiscalized, fiscalized, and manual flows.
- **Customer management** and customer-to-transaction linking.
- **Receipt and report generation** with queue-backed background processing.
- **Forecourt integration** for pump state, nozzle state, pricing, tank data, and command/control flows.
- **Setup and device onboarding** including station bootstrap, device registration checks, and setup validation endpoints.
- **Administrative configuration** for branding, station config, sync, diagnostics, logs, users, and secure artifacts.
- **Runtime observability** through health, readiness, metrics, logs, archived events, and worker heartbeats.
- **PWA behavior** via `public/manifest.json` and `public/sw.js`, including push notifications.

## Tech stack

- **Framework:** Next.js 13.4 (App Router)
- **Language:** TypeScript
- **UI:** React 18, Tailwind CSS, Radix UI, Lucide
- **Primary operational datastore:** PostgreSQL
- **Additional DB integration:** Azure SQL support exists for selected infrastructure paths
- **Realtime:** Socket.IO for forecourt/websocket communication
- **Validation:** Zod
- **Background processing:** in-process workers, dedicated worker entrypoints, and queue tables in Postgres
- **Packaging:** Next standalone output + bundled Node server (`vpos-server.cjs`)

## Runtime model

The repo supports multiple runtime shapes.

### 1) Web server runtime

Used by `npm start`.

- Loads environment variables.
- Ensures first-boot bootstrap and Postgres migrations are applied.
- Starts the Next.js app.
- Starts selected local runtime workers.
- Optionally enables HTTPS via local certificate paths.
- Attaches the forecourt websocket server.

Primary entrypoints:

- `start.cjs`
- `server.ts`
- `vpos-server.cjs` (generated during build)

### 2) Dedicated omnibus worker runtime

Used by `npm run worker`.

This starts long-lived polling/supervision processes that are intentionally separated from the request lifecycle.

Primary entrypoint:

- `scripts/worker.ts`

### 3) Standalone worker entrypoints

The repo also exposes worker entrypoints under `workers/**` for specific responsibilities such as:

- transaction fiscalization
- receipt printing
- proxy sending

These are useful when you want to decompose runtime responsibilities across separate processes.

## Repository layout

```text
app/                  Next.js App Router pages and API routes
components/           UI components and layout primitives
public/               Static assets, manifest, service worker, local certs
scripts/              Operational scripts, migrations, diagnostics, worker launchers
server/               Websocket / legacy server support files
src/modules/          Business modules (transactions, products, forecourt, setup, etc.)
src/platform/         Platform/infrastructure concerns (db, runtime, config, auth, observability)
src/shared/           Shared facades, utilities, adapters, helpers, and cross-cutting code
tests/                Focused test suites for selected modules/workflows
workers/              Thin worker entrypoints
```

## Module map

Key modules under `src/modules/` include:

- `transactions` — transaction lifecycle, queueing, fiscalization orchestration
- `fiscal-inbox` — fiscal message inbox, retry/export/requeue flows
- `forecourt` — pump/tank/adapter/runtime synchronization
- `pos` — POS command/event handling
- `products` — product catalog CRUD and sync
- `customers` — station-linked customer management
- `printing` — print jobs and receipt workflows
- `reports` — report generation and queue processing
- `setup` — first-time setup and station/device onboarding
- `runtime` / `supervisor` / `status` — operational runtime state and supervision
- `admin-*` modules — admin configuration, diagnostics, integrations, and logs

Most modules follow a layered shape such as:

- `application/`
- `domain/` (where needed)
- `infrastructure/`
- `presentation/` (where needed)

## API surface

The HTTP API is implemented primarily via Next route handlers in `app/api/**`.

Representative areas include:

- `app/api/auth/**` — login/logout/session
- `app/api/setup/**` — setup wizard and device validation
- `app/api/transactions/**` — transaction creation, allocation, fiscalization, reporting
- `app/api/runtime/fiscal/inbox/**` — inbox operations, bulk actions, exports, requeue
- `app/api/admin/**` — diagnostics, logs, setup, config, users, sync, branding
- `app/api/forecourt/**` and `app/api/admin/forecourt/**` — status, diagnostics, events, pricing, state
- `app/api/healthz`, `app/api/readyz`, `app/api/metrics` — operational endpoints

Most authenticated routes are wrapped through shared route helpers that centralize:

- authentication
- role checks
- body parsing
- CSRF validation
- consistent error handling

## Configuration

The app reads configuration from multiple places depending on responsibility:

- `.env.local` / `.env`
- station config stored in Postgres
- station key/value data
- imported or generated configuration defaults
- filesystem-backed legacy data/import directories

### Common environment variables

The codebase references many env vars. The most important ones for local setup appear to be:

| Variable                                             | Purpose                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `POSTGRES_URL`                                       | Primary Postgres connection string                             |
| `PORT`                                               | HTTP port for the Node/Next server (default: `3080`)           |
| `HOST`                                               | Bind host for the main server (default: `0.0.0.0`)             |
| `VPOS_STATION_ID`                                    | Runtime station UUID used by workers and station-scoped flows  |
| `RUN_BOOTSTRAP`                                      | Enables/disables first-boot bootstrap work                     |
| `RUN_PROXY_WORKER`                                   | Enables the proxy sender worker in local server runtime        |
| `LEGACY_PERM_DIR`                                    | Legacy source; defaults to `/opt/fccapps/vpos-perm/vposfiscal` |
| `LEGACY_IMPORT_DIR`                                  | Writable archive; defaults to `<PERM_DIR>/legacy-archive`      |
| `PERM_DIR`                                           | Persistent root; defaults to `/opt/fccapps/vpos-perm/vposftc`  |
| `FORECOURT_MODE`                                     | Forecourt integration mode selector                            |
| `FORECOURT_TCP_HOST` / `FORECOURT_TCP_PORT`          | Forecourt TCP connection settings                              |
| `PSS_XML_IN_PATH` / `PSS_XML_OUT_PATH`               | PSS XML integration directories                                |
| `PSS_XML_POLL_MS`                                    | Poll interval for PSS XML sync                                 |
| `VPOS_PROXY_URL`                                     | Proxy fiscalization endpoint/base                              |
| `VPOS_PROXY_BASE_PATH`                               | Base path for proxy integration                                |
| `VPOS_PROXY_SENDER_POLL_MS`                          | Poll interval for proxy sender work                            |
| `VPOS_USE_HTTPS`                                     | Enables HTTPS mode when set appropriately                      |
| `VPOS_HTTPS_KEY_PATH` / `VPOS_HTTPS_CERT_PATH`       | Paths to HTTPS certificate assets                              |
| `NEXT_PUBLIC_BASE_URL`                               | Browser-facing base URL                                        |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push configuration                                         |

There are additional specialist variables for DOMS/JPL/PSS integration, logging, diagnostics, heartbeat tuning, and worker polling. Document them further only after confirming the target deployment mode.

## Local development

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL reachable from the app
- A valid station UUID for worker-enabled scenarios
- Optional: local forecourt/proxy/device endpoints if you are testing integrations

### Install

```bash
npm install
```

### Configure environment

Create a local env file and provide, at minimum:

```bash
POSTGRES_URL=postgres://...
PORT=3080
HOST=0.0.0.0
VPOS_STATION_ID=<station-uuid>
RUN_BOOTSTRAP=true
RUN_PROXY_WORKER=false
NEXT_PUBLIC_BASE_URL=http://localhost:3080
```

For integration-heavy development, add the forecourt, proxy, and PSS settings your environment requires.

### Start the app

```bash
npm run dev
```

Useful alternate scripts:

```bash
npm run dev:forecourt   # legacy/compat forecourt server entrypoint
npm run worker          # dedicated omnibus worker process
npm run fiscal:stub     # local fiscal worker stub
```

## Production build and startup

Build:

```bash
npm run build
```

Start:

```bash
npm start
```

Build output details:

- `next build` creates the Next production output.
- `npm run server:gen` bundles `server.ts` into `vpos-server.cjs` using esbuild.
- `start.cjs` acts as the production wrapper with extra diagnostics and optional `.env` loading.

## Operational endpoints

The repo already exposes useful health/ops endpoints:

- `GET /api/healthz`
- `GET /api/readyz`
- `GET /api/metrics`

These are good candidates for:

- container health checks
- orchestrator readiness probes
- Prometheus scraping

## Authentication and authorization

Authentication is session-cookie based.

Key characteristics visible in the code:

- login is handled through `app/api/auth/login/route.ts`
- the session cookie name is `tin_capture_session`
- route helpers enforce role-based access checks
- mutation routes validate CSRF tokens by default
- roles include at least `tenant`, `manager`, and `administrator`

## Bootstrap and setup behavior

On startup, the server bootstrap path can:

- run Postgres migrations
- ensure a station record exists
- seed station settings defaults
- import legacy data if present
- bootstrap station configuration in Postgres
- record bootstrap completion in station KV state

Admin-user creation is handled explicitly through setup flows such as `app/api/setup/admin/route.ts`, rather than being unconditionally created on first boot.

## Database and persistence notes

Postgres is the main application store and contains, among other things:

- stations and station settings
- transactions and fiscalization tables
- receipts
- products and product categories
- queue tables
- process heartbeats
- logs/archive tables
- fiscal inbox data
- forecourt events/state

Migration files live under:

- `scripts/migrations/postgres/`
- `scripts/migrations/azure-sql/`

Azure SQL support is present in the codebase, but the runtime is clearly Postgres-centric today.

## Observability and troubleshooting

Useful built-in diagnostics include:

- process-level wrapper logging in `start.cjs`
- worker heartbeats in Postgres
- archived runtime-bus events
- health/readiness endpoints
- log endpoints under `app/api/logs/**` and `app/api/admin/logs/**`
- diagnostics scripts under `scripts/`

There is an existing operations note at [`scripts/DEBUGGING.md`](./scripts/DEBUGGING.md).

## Testing

There are targeted tests under `tests/`, including suites for:

- fiscalization proxy mapping
- runtime/supervisor behavior

At the moment, `package.json` does not expose a standard `test` script, so test execution should be documented or wired into CI before relying on it as the primary quality gate.

## Production database defaults

The deployed package does not require an `.env` file. In production, the launcher
skips dotenv loading and defaults to the local PostgreSQL server with database
`vpos_ftc`, user `postgres`, and password `postgres`. Before applying migrations,
the app creates the `vpos_ftc` database when it does not already exist. Explicit
service-level environment variables may still override the host, port, user,
password, or database when required by a site.

## Development conventions visible in the repo

- `@/*` path alias is configured in `tsconfig.json`
- business logic is gradually being moved into module/application-layer commands and queries
- platform-owned wrappers exist for runtime, DB, auth, observability, and web-route concerns
- some files are explicitly marked as **legacy** or **compatibility** paths while migration continues

## Recommended next documentation additions

After this baseline README, the most valuable follow-ups would be:

1. a deployment guide by environment
2. an `.env.example` with safe placeholder values
3. a DB schema overview for the core station/transaction/fiscal tables
4. an integration guide for forecourt, proxy, and PSS XML modes
5. a runbook for queue failures, stale heartbeats, and silent exits

- DOMS/JPL special record processing now classifies service-log messages, surfaces unknown/escalated messages, and gives Back Office Records a durable replay/processing lifecycle after controller-buffer clears.

- DOMS/JPL wash transaction capture now records pending `WpTransInUnsBuffer` entries, normalizes `WpUnSupTrans_resp`, stores clear candidates, and surfaces zero-value/error wash transactions for operator review before any future clear automation is enabled.

- DOMS/JPL optional module runtime now persists price-pole, digital-I/O, sensor, and vending snapshots/faults, captures vending totals, and surfaces optional-device alerts in the production workflow review panel.

- DOMS/JPL dynamic tank data governance now restricts `change_DynamicTankData_req` to the protocol-documented `EnteredDensity` payload, validates fixed-width density/date/code fields before send, persists audit rows for requested/sent/failed attempts, and surfaces manual density changes in the production workflow review panel.

### DOMS field-validation release gate

The DOMS field-validation readiness workflow now includes an evidence-backed release gate. Operators can record individual checkpoints or import local build/test, simulator, live-controller, Tanzania endpoint, cloud-cutover, or explicit checkpoint evidence through the Admin Forecourt panel. See `docs/doms-field-validation-release-gate.md` for request examples and safety boundaries.

## DOMS/JPL domain response parsers

The DOMS integration now includes a typed response-parser layer and a domain snapshot endpoint:

- `src/modules/forecourt/infrastructure/jpl/protocol/responses.ts` maps inbound JPL envelopes into stable app-facing families/statuses.
- `GET /api/admin/forecourt/domain-snapshot` returns compact connection, pump, tank, optional-module, and special-record state without requiring consumers to depend on raw JPL field names.
- The production workflow overview includes the same snapshot under `domainSnapshot`.

See `docs/doms-domain-response-parsers.md` for parser coverage and migration guidance.

## DOMS/JPL operational readiness

The DOMS integration now includes an operator-facing readiness rollup:

- `GET /api/admin/forecourt/operational-readiness` combines the typed runtime domain snapshot with field-validation release-gate evidence.
- `JplOperationalReadinessPanel` surfaces live-operation and commissioning decisions, critical blockers, warnings, and the next best operator action.
- Forecourt Controller hardware/software incompatibility, RTC errors, stale heartbeat/logon state, pump/tank critical state, optional-module faults, service-log/BOR review needs, and release-gate blockers are now first-class readiness actions.

See `docs/doms-operational-readiness.md` for the status model and acceptance notes.

## DOMS/JPL local simulator harness

A deterministic local DOMS/JPL simulator is available for development and commissioning rehearsal:

```bash
npm run doms:jpl-sim -- --port 8888 --scenario full --verbose
```

The simulator sends the JPL welcome envelope, accepts STX/ETX-framed JSON messages, emits heartbeats, preserves correlation IDs, returns `RejectMessage_resp` for unsupported or malformed requests, and can replay fixture families for pump status, transaction recovery, wetstock/deliveries, service-log/BOR records, wash, sensors, vending, DIO, and price poles.

See `docs/doms-jpl-simulator-harness.md` for scenarios, CLI options, and validation boundaries.

## DOMS/JPL simulator validation runner

A read-only simulator validation runner is available to convert local JPL simulator rehearsals into importable field-validation evidence:

```bash
npm run doms:jpl-sim:validate -- --host 127.0.0.1 --port 8888 --scenario full --json-out ./doms-jpl-sim-evidence.json
```

The runner checks socket welcome, `FcLogon`, startup unsolicited traffic, core forecourt reads, transaction/wetstock/optional-module reads for the selected scenario, and safe reject behavior. It writes a full report plus a `fieldValidationEvidenceImport` payload that can be pasted into the admin field-validation evidence import panel.

See `docs/doms-simulator-validation-runner.md` for command options and validation boundaries.

## DOMS/JPL simulator self-test

A one-command local simulator self-test is available when you want simulator evidence without running a separate simulator terminal:

```bash
npm run doms:jpl-sim:selftest -- --scenario full --json-out ./doms-jpl-selftest-report.json --evidence-out ./doms-jpl-selftest-evidence.json
```

The self-test starts a local simulator on an OS-selected port by default, runs the validation runner against it, stops the simulator, and emits importable field-validation evidence. This is still simulator-only evidence and does not contact a live DOMS/PSS controller.

See `docs/doms-simulator-self-test.md` for options and safety boundaries.

## DOMS TODO progress report generator

The DOMS checklist progress report is generated by:

```bash
npm run update-todo
```

The generated per-section progress rows now link directly to the matching section headings inside `DOMS_INTEGRATION_TODO.md`, turning the report table into a navigation index for implementation reviews. The script also uses marker comments to replace the generated block idempotently and removes stale duplicate `Last updated` lines left by older runs.

See `docs/doms-progress-report-generator.md` for anchor behavior and test coverage.

## DOMS/JPL live read-only validation runner

A field-safe live validation runner is available for first-site DOMS/PSS acceptance evidence:

```bash
npm run doms:jpl-live:validate -- --host 192.168.1.50 --port 8888 --profile full-readonly --json-out ./doms-jpl-live-report.json --evidence-out ./doms-jpl-live-evidence.json
```

The runner connects to the target controller, performs `FcLogon`, captures startup unsolicited traffic, and sends status/read requests only. It deliberately excludes transaction-buffer reads, clears, authorizations, resets, price changes, dynamic tank-data writes, and PSS maintenance/install commands. The generated evidence payload uses `evidenceType: "live-controller"` and can be imported into the existing field-validation release gate.

Administrators can also run the same workflow through `POST /api/admin/forecourt/field-validation/live-readonly` using the configured station JPL target.

See `docs/doms-live-readonly-validation.md` for profile details and safety boundaries.

### Controlled DOMS/PSS maintenance writes

Maintenance writes are disabled by default. The one-time execution adapter additionally requires a trusted PSS target fingerprint and database migration `1252_doms_maintenance_execution_claims.sql`. See [`docs/doms-maintenance-command-execution.md`](docs/doms-maintenance-command-execution.md).

## DOMS release evidence

The first-production DOMS/JPL implementation backlog is code-complete. Remaining work is classified in `DOMS_REMAINING_WORK.json` as local verification, field validation, external endpoint validation, organizational approval, or deferred scope.

Run the consolidated final verification with:

```bash
npm run doms:release:evidence
```

The command writes `artifacts/doms-release-evidence.json` and stops on the first failed build, test, JPL protocol, simulator self-test, or simulator validation step.
