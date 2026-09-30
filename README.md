# VPOS FTC App

VPOS FTC is a station operations application for transaction capture, fiscalization, receipt processing, forecourt integration, reporting, setup, and runtime supervision.

The repository combines a Next.js web application, server-side API routes, a custom Node.js server, and long-running worker processes. It targets Node.js `>=22.15.0 <23` and currently uses Next.js `16.2.4`, React `19.2.5`, TypeScript, Tailwind CSS `3.4.19`, PostgreSQL, Socket.IO, and Zod.

## Start here

- [Agent and repository rules](AGENTS.md)
- [Contributor workflow](CONTRIBUTING.md)
- [Documentation map](docs/README.md)
- [Architecture](docs/architecture.md)
- [Development setup](docs/development.md)
- [Testing](docs/testing.md)

## Runtime responsibilities

- `app/` contains App Router pages and API route handlers.
- `components/` contains reusable UI and feature presentation components.
- `src/modules/` owns business capabilities such as transactions, forecourt, products, setup, printing, and reporting.
- `src/platform/` owns database, runtime, security, configuration, and observability infrastructure.
- `src/shared/` contains dependency-light utilities and temporary compatibility exports.
- `server.ts` starts the custom HTTP/HTTPS server and the embedded runtime.
- `scripts/worker.ts` starts the omnibus worker runtime.
- `workers/` contains focused worker entrypoints.

The intended dependency direction is:

```text
app/components -> module application/presentation -> module domain -> infrastructure/platform
```

Route handlers should deal with HTTP concerns and delegate business behavior to application services. New code must not add feature dependencies from `src/shared/` back into `src/modules/`.

## Prerequisites

- Node.js 22.15 or newer within Node 22
- npm 10.9.2
- PostgreSQL
- Access to the configured Gilbarco AFS Azure Artifacts npm feed
- Integration endpoints only when testing the relevant forecourt, fiscalization, or device workflow

## Install

Authenticate to the private npm feed configured in `.npmrc`, then install from the lockfile:

```bash
npm ci
```

Copy the environment template:

```bash
cp .env.example .env.local
```

At minimum, configure the PostgreSQL connection and station identity used by your development scenario:

```env
POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/vpos_ftc
VPOS_STATION_ID=<station-uuid>
PORT=3080
HOST=0.0.0.0
NEXT_PUBLIC_BASE_URL=http://localhost:3080
```

Production defaults are defined in `src/platform/runtime/env-defaults.cjs`. Explicit process environment values have the highest precedence.

## Run

```bash
npm run dev
```

Additional runtime commands:

```bash
npm run dev:forecourt
npm run worker
npm run fiscal:stub
```

The production package is built and started with:

```bash
npm run build
npm start
```

`npm run build` creates the Next.js output and generates `vpos-server.cjs`. The bundle is generated output and is not committed.

## HTTPS development

HTTPS is disabled by default. When `VPOS_USE_HTTPS=1`, both certificate paths are mandatory:

```env
VPOS_USE_HTTPS=1
VPOS_HTTPS_KEY_PATH=.certs/localhost-key.pem
VPOS_HTTPS_CERT_PATH=.certs/localhost.pem
```

Keep certificates under the ignored `.certs/` directory or another secure external path. Never place keys or certificates under `public/`.

## Validate changes

Run focused checks while developing, then the full validation command before handoff:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run check
```

Useful additional checks:

```bash
npm run test:audit
npm run test:coverage
npm run check:architecture
npm run check:hygiene
npm run check:docs
```

## Agent-assisted navigation

The repository deliberately avoids committing multi-megabyte symbol and import indexes. Use scoped queries instead:

```bash
npm run agent:find -- route transactions
npm run agent:deps -- src/modules/transactions
npm run agent:impact -- src/modules/forecourt/infrastructure/jpl/adapter.ts
npm run agent:tests -- src/modules/transactions/application
npm run agent:manifest
```

The compact generated manifest is stored at `.agent/manifest.json`.

## Operational endpoints

The application exposes health and operational endpoints including:

- `GET /api/livez`
- `GET /api/healthz`
- `GET /api/readyz`
- `GET /api/metrics`
- `GET /api/startup/status`

Deployment security must explicitly control access to operational endpoints that expose runtime information.

## Packaging targets

The Azure pipeline packages the application for the supported Node.js 22 controller targets:

- CPB539 ARMv7l
- CPB579 ARM64

The generated server bundle remains a required package artifact, but it is produced by CI rather than stored as source.
