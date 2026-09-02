# Architecture

## Purpose

This document describes the current architecture of the VPOS FTC app as implemented in this repository.

The codebase is in a **hybrid state**:

- parts of the system already follow a clearer module/application/infrastructure split
- some runtime and integration flows still preserve legacy behavior for compatibility
- several files explicitly note that migration/extraction is ongoing

That means the architecture is best understood as **a modular monolith with embedded worker runtimes and external integration adapters**.

## High-level view

```mermaid
flowchart LR
  U[Browser / PWA Client] --> N[Next.js App Router UI]
  U --> API[Next.js Route Handlers app/api/**]
  API --> MOD[Module Application Services]
  MOD --> PG[(PostgreSQL)]
  MOD --> AZ[(Azure SQL - selected paths)]
  MOD --> FS[Filesystem / legacy perm directories]
  MOD --> INT[External integrations]

  SRV[Bundled Node server] --> WS[Socket.IO forecourt websocket]
  SRV --> RT[In-process runtime workers]
  WK[Dedicated worker process] --> RT
  RT --> PG
  RT --> INT
  WS --> PG
  WS --> INT
```

## Architectural style

### 1) Modular monolith

The main app is shipped as one deployable codebase and usually one primary web-server process, but internally it is organized into domain-oriented modules under `src/modules/`.

Examples:

- `transactions`
- `forecourt`
- `products`
- `customers`
- `setup`
- `reports`
- `printing`
- `runtime`
- `supervisor`

This keeps deployment simple while still giving the code a strong domain boundary structure.

### 2) Platform vs module split

A useful mental model is:

- **`src/platform/`** = infrastructure/platform concerns the whole app depends on
- **`src/modules/`** = business capabilities
- **`src/shared/`** = cross-cutting facades, helpers, utility layers, and compatibility surfaces

#### Platform layer responsibilities

`src/platform/` owns concerns such as:

- DB connectivity and query helpers
- runtime composition roots
- bootstrap and first-boot behavior
- configuration loading and defaults
- auth/session implementation
- observability/metrics/health
- generic web-route helpers
- security/rate limiting

#### Module layer responsibilities

`src/modules/` owns use-case logic such as:

- fiscalizing a queued transaction
- listing products
- syncing forecourt configuration
- creating customers
- generating reports
- handling setup workflows

### 3) Embedded worker architecture

This is not only a request/response web app.

The system also contains long-lived background loops for:

- POS command polling
- forecourt config synchronization
- transaction queue scheduling
- print jobs
- report jobs
- proxy fiscal sending
- supervisor/heartbeat monitoring
- bounded station storage retention
- optional PSS XML watch/sync behavior

These workers can run:

- in the main server process
- in a dedicated omnibus worker process
- as standalone worker entrypoints

### 4) JPL command facade and handlers

`src/platform/integrations/jpl/client.ts` remains the stable application-facing JPL facade. It owns access checks, gateway startup, APC1 command serialization, shared request/response helpers, and compatibility behavior.

Command-specific orchestration is being extracted under `src/platform/integrations/jpl/commands/`:

- `lifecycle.ts` — ping, POS status, and replay status
- `controllerRecords.ts` — controller state, service-log, and Back Office Record commands
- `pump.ts` — pump reads, authorization, opening/closing, emergency, reset, and error clearing
- `tank.ts` — tank-controller lifecycle, tank status, transaction-buffer status, and delivery read/clear commands
- `transactions.ts` — supervised/unsupervised read, unlock, clear, and complete flows
- `direct.ts` — protocol commands that map directly through the shared command builder

The public `jplHealth` and `jplSendPosCommand` exports remain unchanged. Handler dependencies are explicit, allowing deterministic tests without sockets or PostgreSQL. An architecture guard prevents extracted command branches from being reintroduced into the facade.

## Code organization

### Top-level layout

```text
app/                  UI routes + HTTP API endpoints
src/modules/          Domain/business modules
src/platform/         Platform/runtime/infrastructure
src/shared/           Cross-cutting facades and compatibility helpers
server/               websocket + legacy server support
workers/              thin worker entrypoints
scripts/              operational scripts, migrations, diagnostics
```

### Internal module shape

Many modules use a layered folder structure like:

```text
application/
domain/
infrastructure/
presentation/
```

That typically maps to:

- **application** — use cases, commands, queries, orchestration
- **domain** — domain models/rules when explicitly modeled
- **infrastructure** — DB repos, adapters, worker implementations, storage
- **presentation** — presenters/view-models for API or UI consumption

Not every module has every layer yet.

## Runtime topology

```mermaid
flowchart TD
  A[start.cjs] --> B[vpos-server.cjs / server.ts]
  B --> C[Next.js request handling]
  B --> D[Socket.IO forecourt websocket]
  B --> E[startLocalServerRuntime]
  E --> E1[posCommandsWorker]
  E --> E2[printJobsWorker]
  E --> E3[reportQueueWorker]
  E --> E4[transactionFiscalizationScheduler]
  E --> E5[forecourtConfigSyncWorker]
  E --> E6[proxy sender worker if enabled]
  E --> E7[runtime bus listeners]
  E --> E8[supervisorMonitorRuntimeWorker]
  E8 --> E8A[station storage retention when enabled]
  E --> E9[pssXmlSyncRuntimeWorker]

  W[scripts/worker.ts] --> X[startDedicatedWorkerProcess]
  X --> X1[posCommandsRuntimeWorker]
  X --> X2[forecourtConfigSyncRuntimeWorker]
  X --> X3[transactionFiscalizationSchedulerRuntimeWorker]
  X --> X4[proxyFiscalSenderRuntimeWorker]
  X --> X5[supervisorMonitorRuntimeWorker]
  X5 --> X5A[station storage retention when enabled]
  X --> X6[pssXmlSyncRuntimeWorker]
```

## Entrypoints

### Web server

Primary files:

- `start.cjs`
- `server.ts`
- `server/forecourtWs.ts`

Behavior:

1. load env files
2. install process diagnostics
3. acquire process guard / lock for DOMS process coordination
4. run bootstrap and migrations
5. import legacy data if present
6. load forecourt runtime config
7. start selected runtime workers
8. prepare the Next.js app
9. bind HTTP/HTTPS server
10. attach websocket support

### Dedicated worker process

Primary file:

- `scripts/worker.ts`

Composition is defined in:

- `src/platform/runtime/composition-root.ts`

This process is intended for long-lived polling work that should not depend on request traffic.

### Storage retention runtime

The supervisor monitor owns the station-scoped retention scheduler in both the
local server runtime and the dedicated worker runtime. Retention is disabled by
default and starts in dry-run mode when enabled. The coordinator uses a
station-specific PostgreSQL advisory lock, bounded `SKIP LOCKED` batches,
per-target savepoints, and explicit stop handling so local runtime restarts do
not leave orphaned intervals.

Retention eligibility is hard-coded in `src/platform/retention/`; callers may
configure age limits and batch bounds, but cannot supply arbitrary table or SQL
identifiers through environment variables.

Forecourt payload compaction is a separate, deny-by-default retention target. The JPL
transaction checkpoint is the sole temporary recovery-payload owner; supervised replay
rows retain workflow metadata and read checkpoint payloads through a compatibility join.
Legacy replay payloads are copied to checkpoints before their duplicate columns are
cleared. Eligibility for transaction payload clearing requires durable normalized
ownership, transaction lines, reconciliation, successful controller-buffer clearing, no
active or errored recovery claim, and an elapsed recovery window.
`transactions.doms_payload_json` clears first; raw forecourt and checkpoint payloads clear
only after that marker is durable. A separate terminal-row policy deletes cleared replay
and checkpoint metadata only after payload clearing, canonical transaction completion, and
their independent retention windows. Admin diagnostics and support bundles report payload
ownership, cleared-by-policy, unlinked, terminal, and active-recovery counts.

Forecourt event history is stored as bounded diagnostic evidence rather than a raw
protocol archive. Each event is classified as routine, error,
maintenance/security, or field evidence. New event payloads are hashed,
redacted, and size-bounded before persistence; retention removes each class on
its own configurable schedule. `forecourt_state` remains the current-state
projection and is not treated as an audit log.

Tank gauge writes persist normalized live volume plus a compact versioned
diagnostic envelope and source hash. The former `tanks.last_tg_payload` raw body
is compatibility-only and is cleared after diagnostics exist and the forecourt
payload grace period expires. Unattended receipt/payment JSON remains only on
temporary forecourt recovery rows until controller clear; normalized business
transactions retain typed references and masked card fields instead of another
JSON copy.

Configuration version history is count-bounded per station/plugin/device owner. Normalized JSON hashes suppress unchanged versions, explicitly pinned rows are never eligible, and excess unpinned rows are removed only after the minimum age in bounded retention batches. PSS imports retain raw XML, the export ID map, normalized runtime records, and a compact import summary; the full parsed JSON object is compatibility-only and is removed only after all durable replacements exist and the compatibility window has elapsed. See [`CONFIGURATION_HISTORY_AND_PSS_STORAGE.md`](CONFIGURATION_HISTORY_AND_PSS_STORAGE.md).

### Print job storage model

Transaction receipt and report jobs use the existing `print_jobs.source_transaction_id`
and `print_jobs.source_report_id` references. New reference-backed writers store only
small printer-routing and immutable source metadata in `payload`; the print worker
loads the canonical receipt or report within the same station when it claims the job.

The worker remains dual-read during migration. Legacy embedded ESC/POS, receipt-line,
text, and report payloads continue to execute, and legacy `TRANSACTION_RECEIPT`/`REPORT`
types normalize to the canonical worker types. Specialized formats such as credit notes
remain embedded until they have their own durable canonical receipt model; their content
must not be replaced by the ordinary transaction receipt solely because a transaction
reference is present for printer routing.

### Receipt storage and presentation model

`receipts.plain_text_content` is the canonical immutable printable body for new
transaction receipts. New writers store `html_content = NULL` and record a
`render_version`. HTTP reads generate escaped HTML from plain text with the
versioned pure renderer in `src/shared/receipts/receiptContent.ts`.

The read path remains dual-format during migration. A legacy row with stored
HTML returns that exact HTML unchanged; a plain-text-only row generates HTML on
demand. This preserves historical compatibility without continuing to store a
second derived body for every new receipt.

Receipt JSON snapshots are bounded and versioned. `fiscal_data` contains only
the immutable fiscal identity and verification fields needed by receipt reads,
while `branding_snapshot` contains an allowlisted set of presentation fields.
Transaction lines, customer details, totals, and full fiscal transport responses
remain owned by their canonical transaction, customer, and fiscal-event stores.

### Standalone workers

Primary files:

- `workers/fiscalize-transaction.worker.ts`
- `workers/receipt-print.worker.ts`
- `workers/proxy-sender.worker.ts`

These are thin wrappers over platform runtime services.

## Request architecture

HTTP requests are primarily implemented through Next route handlers in `app/api/**`.

A common request path is:

```mermaid
sequenceDiagram
  participant Client
  participant Route as app/api route
  participant Guard as defineRoute/withAuth
  participant UseCase as module application command/query
  participant Repo as infrastructure repo / db helper
  participant DB as PostgreSQL

  Client->>Route: HTTP request
  Route->>Guard: auth + role + CSRF + body parsing
  Guard->>UseCase: validated call context
  UseCase->>Repo: persistence/integration work
  Repo->>DB: query/update
  DB-->>Repo: result
  Repo-->>UseCase: domain/application result
  UseCase-->>Route: response payload
  Route-->>Client: JSON/HTTP response
```

Representative examples in the repo:

- `app/api/transactions/[id]/fiscalize/route.ts`
- `app/api/products/route.ts`
- `app/api/control/registry/route.ts`

## Transaction and fiscalization pipeline

The transaction path is one of the most important flows in the system.

### Observed pipeline

1. transactions are created and stored in Postgres
2. eligible transactions are claimed by the **transaction fiscalization scheduler**
3. queue rows are inserted for downstream fiscalization work
4. fiscalization execution is handled by dedicated queue/worker logic or an external service path
5. each attempt is persisted once in `fiscalization_events`; direct attempts finalize immediately, while proxy attempts move from `PENDING` to `SUCCESS` or `FAILED`
6. transaction rows retain only current business status, selected fiscal identifiers, `latest_fiscal_event_id`, and a bounded compatibility summary
7. receipt generation and proxy reconciliation read the authoritative event first, with legacy imported transaction responses retained as a measured fallback
8. proxy sending and fiscal inbox flows provide additional delivery/retry handling

### Important nuance

The server-side in-process runtime explicitly states that **actual fiscalization execution is not fully handled in-process** in the default local runtime, because an external service may read from Postgres. The scheduler still runs locally to claim/enqueue eligible work.

### Transaction flow diagram

```mermaid
flowchart LR
  T[Transactions table] --> S[transactionFiscalizationSchedulerWorker]
  S --> Q[transaction_queue rows]
  Q --> F[transactionQueueWorker / external fiscal service]
  F --> R[runFiscalization]
  R --> C[completeTransactionFiscalization]
  R --> E[failTransactionFiscalization]
  C --> FE[(fiscalization_events)]
  E --> FE
  FE --> TX[(transactions: status + latest event pointer)]
  F --> I[Fiscal inbox / proxy / retry paths]
```

### Fiscal payload ownership

- `fiscalization_events.request_payload` and `response_payload` own the sanitized attempt evidence.
- `transactions.fiscalization_response` is compatibility-only. New writers store a small versioned event summary, not the full response.
- `transactions.latest_fiscal_event_id` is application-maintained rather than foreign-key constrained because bidirectional station/cloud sync must insert transactions and events in a non-circular order.
- `receipts.fiscal_data` contains the bounded immutable receipt snapshot needed for deterministic display/reprint, not the original transport response.
- legacy imported transactions may still contain a full response until the proxy heartbeat metric `legacyFiscalizationFallbackReads` remains at zero and a later destructive migration is approved.

## Forecourt architecture

Forecourt support spans several layers:

- configuration sync worker
- adapter state management
- websocket transport to clients
- pump/tank status queries and commands
- persistence of forecourt events/state in Postgres

### Key pieces

- `src/modules/forecourt/**`
- `server/forecourtWs.ts`
- shared forecourt adapters/runtime state under `src/shared/forecourt/**`

### Behavior

The websocket server:

- attaches to the Node HTTP server
- tracks connected clients
- reads local adapter state and persisted shared state
- computes a derived forecourt status (`online`, `degraded`, `offline`)
- validates commands and nozzle context
- publishes state/ack messages back to clients

### Forecourt flow diagram

```mermaid
flowchart TD
  C[Admin/ops client] --> WS[Socket.IO forecourt websocket]
  WS --> AD[Forecourt adapter state]
  WS --> DB[(Postgres forecourt events/state)]
  WS --> Q[Forecourt command queue]
  Q --> GW[Gateway / adapter]
  GW --> Pump[Pump and nozzle hardware/integration]
  Pump --> GW
  GW --> DB
  DB --> WS
```

## Runtime bus

The app includes an in-process pub/sub bus in `src/shared/runtime/bus.ts`.

This bus is used for decoupled internal events, including:

- POS events
- fiscal request/response coordination
- archive capture
- pending attendant auth tracking

The archive bus listener also stores best-effort records of runtime events.

This gives the monolith an internal event-driven spine without requiring an external broker.

## Persistence architecture

### PostgreSQL: primary datastore

Postgres is the main system of record.

Migration names indicate it stores:

- core entities and stations
- transactions and fiscalization events
- receipts and credit notes
- products and categories
- customers
- pump/tank/nozzle and forecourt state
- sync jobs and queues
- process heartbeats
- station KV/config/version history
- logs, archive exports, and secure artifacts
- fiscal inbox and retry/dead-letter support

### Azure SQL: secondary/integration datastore

The repo also includes `src/platform/db/azure-sql.ts` and Azure SQL migrations.

This appears to be a secondary or compatibility datastore rather than the primary runtime data backbone.

### Filesystem-backed legacy inputs

The system still interacts with filesystem directories for:

- legacy imports
- permanent/station data directories
- PSS XML integration
- local certificates

This is an important compatibility concern in deployments that still ingest legacy outputs.

## Bootstrap and configuration architecture

Bootstrap begins in platform runtime/server startup and includes:

- Postgres migrations
- advisory locking to prevent duplicate first-boot execution
- station creation or reconciliation
- station settings seeding
- legacy import if available
- station config bootstrap
- bootstrap completion markers in station KV

Configuration can originate from:

- env vars
- station KV
- DB-stored `station_config`
- imported JSON config
- platform defaults

The config loader merges/minimizes these sources and validates them against schema.

## Authentication and security

### Authentication model

- session-cookie based auth
- login route issues server-side sessions
- session cookie name: `tin_capture_session`
- role-aware route guards around most API handlers

### CSRF model

Mutation helpers validate CSRF by default using headers and/or body tokens.

### Authorization model

Role checks are centralized through shared auth/platform policy helpers. Observed roles include:

- tenant
- manager
- administrator

### Other security-related concerns

The repo also contains:

- rate-limit helpers
- secure-artifact support
- password hashing and session cleanup logic
- request/body validation wrappers

## Reliability mechanisms

The architecture includes several resilience features:

### 1) Process guard

`server.ts` uses a DOMS process guard to avoid problematic duplicate process startup behavior in some deployment modes.

### 2) Advisory locks

First-boot initialization uses Postgres advisory locks to serialize bootstrap work.

### 3) Worker heartbeats

Workers upsert heartbeat records, allowing stale-worker detection and restart logic.

### 4) In-process monitoring

`startInProcessRuntime` monitors worker heartbeat freshness and can restart stale workers with exponential backoff.

### 5) Production diagnostics wrapper

`start.cjs` adds diagnostics for:

- uncaught exceptions
- unhandled rejections
- process lifecycle events
- optional heartbeat file emission
- optional redacted env dumps

### 6) Health and readiness endpoints

- `/api/healthz`
- `/api/readyz`
- `/api/metrics`

## Deployment shape

### Build

```text
next build
+ esbuild bundle of server.ts -> vpos-server.cjs
```

### Runtime

- Next standalone output is enabled in `next.config.mjs`
- `start.cjs` is the production-friendly wrapper
- the server can run in HTTP or HTTPS mode
- websocket support is attached in the same process

### Operational implication

This is best deployed as a **small set of cooperating Node processes**:

- 1 web process
- optionally 1 omnibus worker process
- optionally additional dedicated workers for queue isolation

## Key architectural strengths

- strong domain/module decomposition for a single-repo system
- centralized route/auth/error-handling helpers
- practical runtime supervision and heartbeat support
- explicit first-boot and migration flow
- flexible worker deployment model
- clear separation between platform concerns and business modules

## Current architectural trade-offs

### 1) Hybrid legacy/canonical structure

Some files are clearly marked as compatibility or migration-era paths. This is workable, but it increases the cognitive load for maintainers.

### 2) Runtime divergence

The local server runtime, omnibus worker runtime, and standalone worker entrypoints do not all start exactly the same set of services. That is intentional today, but must stay documented or operators will make incorrect assumptions.

### 3) Mixed persistence story

The system is operationally Postgres-first, but still carries Azure SQL and filesystem compatibility paths. That adds flexibility at the cost of complexity.

### 4) Large route surface

The API surface is broad and operationally rich. That is useful for the product, but it raises the importance of consistent route conventions, integration testing, and endpoint ownership.

## Extension guidance

When adding new functionality, follow this pattern where possible:

1. create or extend a business module under `src/modules/<capability>`
2. put use-case logic in `application/`
3. isolate persistence/adapters in `infrastructure/`
4. expose HTTP behavior through `app/api/**`
5. use platform route helpers for auth/CSRF/error handling
6. prefer platform/shared facades instead of reaching directly across unrelated modules
7. add heartbeat/observability if the feature introduces background processing

## Suggested future cleanup

To make the architecture easier to operate and document, the next improvements would be:

- standardize which runtime responsibilities belong to web vs omnibus vs standalone workers
- add explicit runbooks for each runtime mode
- publish an `.env.example`
- publish a DB schema map for the top 20 tables
- add a formal test runner and CI command
- continue collapsing legacy compatibility paths behind platform/module facades

## Configuration ownership and station KV boundary

Current configuration ownership is defined in [`CONFIGURATION_OWNERSHIP.md`](CONFIGURATION_OWNERSHIP.md).

Typed station settings remain in `station_settings`; current station, plugin, and device configuration documents remain in their purpose-specific tables. `station_kv` is a bounded compatibility/operational store rather than a second business-settings database.

All normal KV writes pass through `src/platform/config/station-kv-policy.ts`, which classifies key ownership, validates selected value schemas, and enforces payload limits. Compatibility mode logs bounded unregistered writes; strict mode rejects them. Non-empty process environment values take precedence over persisted `env:NAME` fallbacks and code defaults.

Migration `1263_configuration_ownership_guardrails.sql` removes new application dependence on `station_settings.key`, adds non-destructive KV key/size constraints, and marks `station_kv.value_json`, `station_settings.value_json`, and `job_queue` as retirement candidates. Migration `1266_legacy_config_storage_retirement_support.sql` adds only an operator audit ledger; it does not drop data. Actual retirement is isolated behind `npm run config:storage:retire`, which requires maintenance and backup acknowledgements, reruns the audit under a transaction advisory lock, uses `RESTRICT` drop semantics, and verifies the post-drop schema before commit. The detailed procedure and compatibility-shell restore boundary are defined in [`CONFIGURATION_STORAGE_RETIREMENT.md`](CONFIGURATION_STORAGE_RETIREMENT.md).
