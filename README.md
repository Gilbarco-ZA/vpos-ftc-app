# VPOS FTC App

VPOS FTC is a station operations application for transaction capture, fiscalization, receipt processing, forecourt integration, reporting, setup, and runtime supervision.

The repository combines a Next.js web application, server-side API routes, a custom Node.js server, and long-running worker processes. It targets Node.js `>=22.15.0 <23` and currently uses Next.js `16.2.4`, React `19.2.5`, TypeScript, Tailwind CSS `3.4.19`, PostgreSQL, Socket.IO, and Zod.

## Start here

- [Agent and repository rules](AGENTS.md)
- [Contributor workflow](CONTRIBUTING.md)
- [Documentation map](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/development.md)
- [Testing](docs/testing.md)
- [Field Support, Installation & Commissioning Manual](docs/manuals/TECHNICIAN_SETUP_GUIDE.md)
- [Manager Operations & Training Manual](docs/manuals/MANAGEMENT_GUIDE.md)

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

## Development prerequisites

- Node.js 22.15 or newer within Node 22
- npm 10.9.2
- PostgreSQL
- Access to the configured Gilbarco AFS Azure Artifacts npm feed
- Integration endpoints only when testing the relevant forecourt, fiscalization, or device workflow

## Development setup

Authenticate to the private npm feed configured in `.npmrc`, then install from the lockfile:

```bash
npm ci
```

Copy the development environment template:

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

These instructions are for developer workstations only. Production DOMS controllers do not use a field-managed `.env` file.

## Run locally

```bash
npm run dev
```

Additional developer/runtime commands:

```bash
npm run dev:forecourt
npm run worker
npm run fiscal:stub
```

The production application is built by CI and packaged for the supported DOMS targets. Field technicians do not build or start production from source.

## Production deployment model

Production is delivered as an approved package installed directly on the DOMS:

- CPB-579: `cpb-579-node22.pkg`
- CPB-539: `cpb-539-node-22.pkg`

The production field model is deliberately locked down:

- no SSH access
- no terminal/shell access
- no source checkout on the DOMS
- no npm/Node commands executed by field staff
- no manual SQL execution
- no application-file edits
- no production `.env` editing

The package runs as a managed secure DOMS application. Station-specific adjustments are made through supported VPOS configuration screens and approved DOMS/PSS administration workflows.

See the [Field Support, Installation & Commissioning Manual](docs/manuals/TECHNICIAN_SETUP_GUIDE.md).

## HTTPS development

HTTPS is disabled by default in development. When `VPOS_USE_HTTPS=1`, both certificate paths are mandatory:

```env
VPOS_USE_HTTPS=1
VPOS_HTTPS_KEY_PATH=.certs/localhost-key.pem
VPOS_HTTPS_CERT_PATH=.certs/localhost.pem
```

Keep certificates under the ignored `.certs/` directory or another secure external path. Never place keys or certificates under `public/`.

## Validate changes

Run focused checks while developing, then the full validation command before handoff:

```bash
npx prettier --check .
npm run typecheck
npm test
npm run check
```

`npm run lint` currently runs Prettier in write mode, so use `npx prettier --check .` when you need a non-mutating formatting check.

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

Deployment security must explicitly control access to operational endpoints that expose runtime information. These are implementation/runtime interfaces and are not a substitute for the field-support UI workflow documented in the production manual.

## Production handover documentation

Production handover uses two primary files:

- [Field Support, Installation & Commissioning Manual](docs/manuals/TECHNICIAN_SETUP_GUIDE.md) — DOMS package deployment, application configuration, commissioning, troubleshooting, screenshots, acceptance, and support sign-off.
- [Manager Operations & Training Manual](docs/manuals/MANAGEMENT_GUIDE.md) — daily operations, controlled manager configuration, training exercises, screenshots, escalation, and competency sign-off.

## Packaging targets

The Azure pipeline packages the application for the supported Node.js 22 controller targets:

- CPB-539 ARMv7l
- CPB-579 ARM64

The generated server bundle remains a required package artifact, but it is produced by CI rather than stored as source.
