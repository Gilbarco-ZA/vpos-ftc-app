# VPOS FTC App

A Next.js 13 + Node.js operations console for fuel-station transaction capture, fiscalization, forecourt integration, reporting, and station administration.

This repository combines three concerns in one codebase:

1. **The web UI** built with the Next.js App Router.
2. **A server-side API surface** under `app/api/**` for station operations, setup, diagnostics, and device control.
3. **Background runtime workers** for queue processing, forecourt synchronization, printing, reporting, proxy sending, and runtime supervision.

The app is designed to support station operations end to end: customer capture, transaction lifecycle management, fiscalization workflows, receipt printing, pump/tank administration, and operational diagnostics.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the technical architecture.

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

| Variable                                             | Purpose                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `POSTGRES_URL`                                       | Primary Postgres connection string                            |
| `PORT`                                               | HTTP port for the Node/Next server (default: `3080`)          |
| `HOST`                                               | Bind host for the main server (default: `0.0.0.0`)            |
| `VPOS_STATION_ID`                                    | Runtime station UUID used by workers and station-scoped flows |
| `RUN_BOOTSTRAP`                                      | Enables/disables first-boot bootstrap work                    |
| `RUN_PROXY_WORKER`                                   | Enables the proxy sender worker in local server runtime       |
| `LEGACY_PERM_DIR`                                    | Source directory for legacy fiscal/console artifacts          |
| `LEGACY_IMPORT_DIR`                                  | Destination/root used when moving imported legacy files aside |
| `PERM_DIR`                                           | General persistent-data directory candidate                   |
| `FORECOURT_MODE`                                     | Forecourt integration mode selector                           |
| `FORECOURT_TCP_HOST` / `FORECOURT_TCP_PORT`          | Forecourt TCP connection settings                             |
| `PSS_XML_IN_PATH` / `PSS_XML_OUT_PATH`               | PSS XML integration directories                               |
| `PSS_XML_POLL_MS`                                    | Poll interval for PSS XML sync                                |
| `VPOS_PROXY_URL`                                     | Proxy fiscalization endpoint/base                             |
| `VPOS_PROXY_BASE_PATH`                               | Base path for proxy integration                               |
| `VPOS_PROXY_SENDER_POLL_MS`                          | Poll interval for proxy sender work                           |
| `VPOS_USE_HTTPS`                                     | Enables HTTPS mode when set appropriately                     |
| `VPOS_HTTPS_KEY_PATH` / `VPOS_HTTPS_CERT_PATH`       | Paths to HTTPS certificate assets                             |
| `NEXT_PUBLIC_BASE_URL`                               | Browser-facing base URL                                       |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push configuration                                        |

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
