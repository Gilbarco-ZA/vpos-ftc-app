# Startup flow

The production server now separates process liveness from station-data readiness.

1. Database bootstrap and migrations run first.
2. The HTTP port binds and `/api/livez` immediately reports process liveness.
3. Next.js prepares and serves the startup progress screen.
4. Legacy files import asynchronously with progress exposed by `/api/startup/status`. This is the exclusive post-launch task.
5. Only after the import check settles does startup attach the forecourt WebSocket layer, load forecourt configuration, establish JPL, and start runtime workers.
6. Startup reaches `ready`, or `degraded` when a non-fatal post-start phase fails.

The root page polls startup status and only routes to setup, login, or dashboard after the post-start initialization completes.

## JPL connection test

A successful logon and accepted status-update mode establish the connection test result. The optional all-pump `FpStatus_req` snapshot remains visible as an advisory when a controller does not answer pump ID `00` within the test timeout. Individual pump state must then be verified after the forecourt runtime starts.

## Pre-setup startup page

The root route redirects to `/startup`. This page polls `GET /api/startup/status` and displays the active bootstrap, import, and forecourt-start phases. When startup reaches `ready` or `degraded`, it routes the operator to setup, login, or the dashboard based on registration and session state.

Direct navigation to `/setup` is guarded. If startup work is still active, the setup gate redirects to `/startup?next=/setup` and resumes setup automatically after imports complete.

## Production PostgreSQL database bootstrap

Production packages do not depend on `.env` files. The production launcher skips
`.env`, `.env.production`, and `.env.local` loading and uses the built-in local
PostgreSQL defaults unless the service manager explicitly supplies environment
variables.

The default application database is `vpos_ftc`. Before migrations run, startup
connects to the PostgreSQL administrative `postgres` database, checks
`pg_database`, and creates `vpos_ftc` when it is missing. Database creation is
idempotent and tolerates two application instances racing to create the database.

Development may still use `.env.local`. Its sample `POSTGRES_URL` targets
`vpos_ftc` rather than the PostgreSQL maintenance database.

## JPL startup ordering invariant

`attachForecourtWs()` must remain after `await runStartupImport(stationId)` in
`server.ts`. Attaching the WebSocket layer starts the pump bus and forecourt
command processor, which in turn can initialize the JPL TCP adapter. Moving it
earlier can make legacy imports compete with controller traffic and database
requests, increasing startup latency and risking service-manager timeouts.

The required production order is:

`database -> migrations -> HTTP/Next.js -> legacy import check -> WebSocket/JPL -> workers -> ready`

## PSS Configurator import defaults

A successful `config.xml` import now reconciles DOMS wetstock identity before live JPL use:

- `Tank@TankGroupID` is mapped to a station tank group.
- `TankGauge@ID` is persisted as the tank's DOMS/Tg identifier used by `TgData_req`.
- when the station POS backend is unset or `none`, it is changed to `jpl`.
- the JPL host defaults to `127.0.0.1` and both APC1 and APC2 are enabled unless an explicit host already exists.

The import never invents a PSS tank-group value when `TankGroupID` is absent from the XML.
