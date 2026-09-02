# Refactor Pass History

## Pass 1 - UI/API boundaries and repository guardrails

Date: 2026-07-13

### Changes

- Replaced direct database access in the station settings page with the existing `/api/admin/settings` endpoint.
- Added a loading skeleton and API error state for station settings.
- Added `GET /api/settings/pumps/[id]` with application and repository layers.
- Replaced direct pump database access in the pump detail page with the new endpoint.
- Added a loading skeleton and API error state for pump details.
- Added `npm run check:architecture` to prevent new page imports from database and infrastructure layers.
- Captured existing page-boundary debt in `.agent/page-boundary-baseline.json`; the baseline must shrink as pages are refactored.
- Consolidated historical DOMS integration pass files into `docs/DOMS_INTEGRATION_HISTORY.md`.

### Compatibility

- Existing authentication and role checks remain at the route-page boundary.
- Existing form components, API mutation behavior, pump websocket updates, and nozzle management remain unchanged.
- No database schema changes were introduced.

## Pass 2 - Page boundary completion and bootstrap API routing

Date: 2026-07-13

### Completed

- Removed the final three direct page-to-database/infrastructure imports.
- Reduced the architecture baseline from three known violations to zero.
- Added a shared bootstrap status API contract for login, setup, and root routing.
- Extended `GET /api/bootstrap/status` with proxy reachability and device registration state.
- Replaced server-side bootstrap/database execution in `/`, `/login`, and `/setup` with API-backed client gates.
- Added reusable page skeletons for bootstrap transitions.
- Moved `ForecourtEventRow` from the infrastructure repository to a public forecourt contract.
- Removed synchronous prop-derived state mirroring from the setup wizard.
- Deferred local-storage step restoration to avoid synchronous state updates inside an effect body.

### Architecture result

`npm run check:architecture` now reports zero known violations.

### Follow-up

The next boundary pass should target page imports from application query modules, beginning with POS and fiscal inbox pages. Authentication guards may remain server-side because they are access-control boundaries rather than domain execution.

## Pass 3 - API-backed POS and fiscal inbox pages

- Corrected DOMS migration foreign keys in migrations `1252` and `1253` to reference `fuel_stations(id)`.
- Added `GET /api/pos/catalog` as the canonical UI contract for POS catalog data, category filtering, decimal settings, and role-specific transaction navigation.
- Replaced direct POS page application queries with an abort-safe client loader and loading skeleton.
- Updated the fiscal inbox list API to return presentation-ready rows.
- Replaced direct fiscal inbox page queries with API hydration through the existing client surface.
- Replaced the fiscal inbox text loading state with a reusable table skeleton.
- Kept page files declarative and free of domain query, database, and infrastructure execution.

## Pass 4 - Type safety fixes and remaining page query removal

- Fixed the 25 reported TypeScript errors across forecourt UI state and DOMS tests.
- Added API-backed page bootstrap for admin products and proxy settings.
- Expanded the fiscal inbox detail API and converted its page to an API loader.
- Removed all remaining application-query and shared-server imports from page components.
- Preserved the zero-violation hard architecture boundary.

## Pass 5 - Runtime archive containment and retention

Date: 2026-07-21

### Completed

- Disabled wildcard runtime bus archiving by default through `VPOS_RUNTIME_ARCHIVE_MODE=off`.
- Added fail-closed compact allowlist mode with topic and message-type matching.
- Replaced full bus payload persistence with a compact diagnostic envelope containing only selected identifiers, outcome fields, normalized timestamps, and sanitized error metadata.
- Added sensitive error-message redaction and source guards that prevent `payload: msg` from being reintroduced.
- Added bounded age-based cleanup for `archive_events`, protected by a PostgreSQL transaction advisory lock.
- Added migration `1254_runtime_archive_retention.sql` for the cleanup index.
- Documented runtime archive configuration and updated the storage reduction plan.
- Regenerated `.agent` repository metadata.

### Validation

- Targeted runtime archive tests: 8 passed.
- New TypeScript files parsed and bundled successfully with esbuild using external repository imports.
- Page boundary architecture check remains at zero violations.
- Full dependency installation and the complete repository test suite could not run because the private Gilbarco Azure npm feed was unreachable from the analysis environment.
- `vpos-server.cjs` was not regenerated for the same reason; the normal authenticated build must regenerate it before packaging a production deployment.

## Pass 6 - Queue, inbox, audit, and log retention

Date: 2026-07-21

### Completed

- Added a cross-cutting retention coordinator under `src/platform/retention`.
- Added feature-flagged dry-run-first cleanup for terminal print, transaction, and report queues, processed fiscal inbox rows, resolved dead-letter inbox rows, audit logs, expired sessions, and VPOS logs.
- Added station-scoped advisory locking, small `SKIP LOCKED` batches, per-target savepoints, lock/statement timeouts, structured metrics, and clean worker shutdown/restart handling.
- Required canonical receipt/transaction/report rows before deleting successful queue work.
- Excluded pending, processing, retryable failures, and unresolved dead-letter rows.
- Added `fiscal_inbox.resolved_at`, updated single/bulk process, requeue, failure, dead, and clone-and-requeue transitions, and exposed resolution time in fiscal inbox detail views.
- Routed the existing audit/session and VPOS log cleanup scripts through the central retention coordinator.
- Removed the unused unbounded `deleteLogsOlderThan()` path.
- Added migration `1255_queue_and_log_retention.sql`, a safe `.env.example`, and targeted source/policy tests.

### Rollout

Retention remains disabled by default and dry-run is the default when enabled. Deploy with `VPOS_RETENTION_ENABLED=true` and `VPOS_RETENTION_DRY_RUN=true`, review station metrics, then explicitly enable deletion after approval.

### Validation

- Storage/archive targeted tests: 14 passed.
- New and modified TypeScript modules bundled successfully with esbuild using external package resolution.
- Agent metadata regeneration, architecture validation, JSON parsing, and local Markdown-link validation passed.
- Full dependency installation did not complete in the analysis environment, so the complete test suite, production build, and generated `vpos-server.cjs` refresh remain deployment-build steps.

## Pass 7 - Reference-based print jobs

Date: 2026-07-21

### Completed

- Added a print-job payload policy that canonicalizes receipt/report job types and retains only compact routing and immutable source metadata for reference-backed jobs.
- Converted transaction receipt, automatic fiscal receipt, receipt-route, and report writers to use the existing `source_transaction_id` or `source_report_id` columns instead of embedding receipt/report bodies.
- Updated the worker and repository to claim both source references and load canonical receipt/report rows within the job station.
- Added exact immutable receipt-ID lookup, plain-text-first rendering, and stored-HTML-to-text compatibility fallback.
- Preserved legacy embedded ESC/POS, receipt-line, text, and report payload handling while old queues drain.
- Preserved specialized embedded receipt formats such as credit notes; a transaction reference used for printer routing no longer causes the ordinary transaction receipt to replace specialized content.
- Normalized legacy `TRANSACTION_RECEIPT` and `REPORT` job types to `print.receipt` and `print.report`.
- Added migration `1256_reference_based_print_jobs.sql`, which compacts only pending ordinary receipt/report jobs with a matching canonical source and never mutates processing or specialized jobs.
- Removed the unused duplicate `src/platform/db/queries/printJobs.sql.ts` definition.

### Compatibility boundary

Generic POS print jobs and credit-note print jobs remain embedded because the repository does not yet persist equivalent purpose-specific canonical receipt rows. The worker is dual-read so existing embedded jobs remain executable. Automatic compaction is limited to explicitly identified ordinary transaction-receipt sources.

### Validation

- Reference-print policy and migration tests: 6 passed.
- Combined printer, archive, retention, and reference-print regression set: 23 passed.
- Changed print/runtime modules bundled successfully with esbuild using external package resolution.
- Full dependency installation, the complete repository test suite, production build, and generated `vpos-server.cjs` refresh remain authenticated deployment-build steps.

## Pass 8 - Canonical plain-text receipts and generated HTML

Date: 2026-07-21

### Completed

- Extracted deterministic plain-text-to-HTML receipt rendering into `src/shared/receipts/receiptContent.ts` and assigned renderer version `1`.
- Added dual-read receipt presentation: legacy stored HTML is returned unchanged, while plain-text-only rows generate HTML on demand.
- Stopped generating and storing HTML for new fiscalized and manually created transaction receipts.
- Added explicit versioned fiscal and branding snapshot schemas; new receipt fiscal snapshots no longer duplicate transaction lines, customer data, totals, template models, or full fiscal responses.
- Updated receipt API reads to expose generated presentation content and prefer immutable branding snapshots.
- Updated transaction receipt reads to load the immutable stored receipt rather than regenerating it from current transaction state.
- Updated automatic printing to reuse an existing canonical receipt when one already exists.
- Added PostgreSQL migration `1257_plain_text_receipt_canonical.sql` and Azure SQL migration `024_plain_text_receipt_canonical.sql`.
- Added `render_version` to receipt synchronization while retaining nullable legacy HTML compatibility.

### Compatibility boundary

- Existing receipt rows with stored HTML remain unchanged and continue to return that exact HTML.
- Existing rows with only HTML derive plain text only when a printable-text consumer requires it.
- New rows require canonical plain text and store null HTML.
- No HTML backfill is performed. A later destructive cleanup may remove legacy HTML only after deployment data proves every retained receipt has canonical plain text and the required legal retention review is complete.

### Validation

- Canonical receipt storage tests: 8 passed.
- Combined printer, archive, retention, reference-print, and canonical-receipt regression set: 31 passed.
- Tanzania receipt-template and receipt-preview regression set: 6 passed.
- Eleven changed TypeScript entrypoints bundled successfully with esbuild using external package resolution.
- Full dependency installation, complete repository tests, production build, and `vpos-server.cjs` regeneration remain authenticated deployment-build steps.

## Pass 9 - Fiscalization event canonicalization compatibility layer

Date: 2026-07-21

### Completed

- Added a versioned fiscalization event domain contract with deterministic payload hashing and recursive secret/payment-data redaction.
- Added one persistence path for direct and proxy fiscal attempts under `fiscalization_events`.
- Added proxy attempt lifecycle support: a submission is stored as `PENDING` and the same event is finalized as `SUCCESS` or `FAILED` during reconciliation.
- Added `transactions.latest_fiscal_event_id` as the application-maintained pointer to the authoritative attempt.
- Replaced new full `transactions.fiscalization_response` writes with a bounded compatibility summary containing the event ID, status, transport, selected identifiers, payload hash, and timestamp.
- Updated direct fiscalization completion/failure to write the event and transaction state atomically.
- Updated proxy submission, immediate final responses, reconciliation, and transport failures to write/finalize fiscal events atomically with transaction state.
- Updated fiscal inbox failure messages to reference the event and compact summary rather than copying full fiscal payloads.
- Updated receipt generation, receipt preview APIs, and proxy reconciliation to read event payloads first while retaining legacy transaction-column fallback.
- Added an in-process legacy fallback read counter and exposed it as `legacyFiscalizationFallbackReads` in proxy worker heartbeat metrics for rollout verification.
- Added event transport, schema version, payload hash, origin, idempotency key, finalization time, and latest-event indexes to PostgreSQL and Azure SQL migrations.
- Added the new event metadata and latest-event pointer to station sync specifications.

### Compatibility boundary

- Existing imported transactions with full `fiscalization_response` values remain unchanged and readable.
- No destructive backfill or clearing of legacy transaction responses is performed in this pass.
- `fiscalization_response` remains in sync for compatibility, but new runtime values are bounded summaries rather than full fiscal transport payloads.
- The column can be removed from sync and later dropped only after deployment telemetry shows zero legacy fallback reads and older application versions are retired.
- Credit-note fiscalization remains owned by its existing purpose-specific `credit_notes.proxy_response` path and is not migrated by this transaction-attempt pass.

### Validation

- Combined fiscalization, receipt, print, archive, retention, printer, and route-guard regression set: 40 passed.
- Twelve changed fiscalization/read/sync TypeScript entrypoints bundled successfully with esbuild using external package resolution.
- Page boundary architecture validation passed with zero violations.
- Full dependency installation, complete repository tests, production build, and `vpos-server.cjs` regeneration remain authenticated deployment-build steps.

## Pass 10 - Legacy fiscal-response backfill and guarded sync cutover

Date: 2026-07-21

### Completed

- Added a dry-run-first, station-scoped fiscal-event backfill command with explicit apply, all-station, batch-size, and maximum-batch controls.
- Added station advisory locking and bounded `FOR UPDATE ... SKIP LOCKED` candidate processing.
- Added normalized payload classification, recursive redaction, deterministic payload hashing, and deterministic transaction/payload idempotency keys.
- Reused equivalent canonical events before inserting and compacted migrated transaction responses to the same bounded compatibility summary used by current runtime writes.
- Excluded valid summary/pointer pairs from candidate scans and added bounded repair for missing or stale `latest_fiscal_event_id` pointers.
- Closed the active setup importer and standalone legacy importer so they create canonical fiscal events instead of reintroducing full transaction-column responses.
- Added compatibility-first and guarded events-only sync specifications. Events-only cutover requires local and Azure readiness, zero process-local fallback reads, and explicit operator acknowledgement.
- Added PostgreSQL migration `1259_legacy_fiscal_event_backfill.sql` and Azure SQL migration `026_legacy_fiscal_event_backfill.sql` for payload-hash lookup and local backfill candidate performance.

### Compatibility boundary

The implementation does not automatically execute the production backfill, enable events-only sync, or drop `transactions.fiscalization_response`. Compatibility sync remains the default. Each deployment must review a dry run, apply the bounded migration, verify local/cloud readiness, and complete a release soak with zero fallback reads before setting `VPOS_FISCALIZATION_SYNC_MODE=events-only` and acknowledging the cutover.

### Validation

- Combined fiscal backfill, fiscal event, receipt, print, archive, and retention regression set: 39 passed.
- Ten changed TypeScript entrypoints bundled successfully with external package resolution, and the standalone legacy importer passed Node syntax validation.
- Page-boundary architecture validation passed with zero violations.
- Agent metadata regenerated for 1,627 files, 4,382 symbols, 5,642 import edges, 290 API routes, and 42 pages.
- Fourteen JSON files parsed successfully and 52 Markdown files had zero broken local links.
- The full dependency-backed suite, production build, and generated `vpos-server.cjs` refresh remain authenticated deployment-build steps because private Gilbarco packages are unavailable in the analysis environment.

## Pass 11 - Forecourt and DOMS payload lifecycle

Date: 2026-07-21

### Completed

- Added explicit normalization, reconciliation, ownership, and payload-clear markers for normalized transactions, raw forecourt transactions, JPL checkpoints, and supervised replay rows.
- Added lifecycle-aware, station-scoped payload compaction under `src/platform/retention`, disabled and dry-run by default.
- Required persisted transaction lines, controller clear completion, no active/foreign/errored recovery claim, and an elapsed recovery window before clearing normalized DOMS payloads.
- Ordered compaction so raw forecourt and checkpoint/replay payloads clear only after the canonical transaction payload has been safely cleared.
- Added bounded link repair and payload compaction using savepoints, small batches, table-scoped `FOR UPDATE ... SKIP LOCKED`, and existing station advisory locking.
- Added payload hashes and compact lifecycle diagnostics while preserving rows, identifiers, outcomes, timestamps, and recovery state.
- Reset clear markers whenever a payload is recaptured.
- Added support-bundle and admin lifecycle metrics distinguishing present, cleared-by-policy, unlinked, waiting-for-lines, and active-recovery payloads.
- Removed two unused duplicate JPL SQL modules superseded by the forecourt repositories.
- Added PostgreSQL migration `1260_forecourt_payload_lifecycle.sql` and focused lifecycle/retention tests.

### Compatibility boundary

No production payload is cleared automatically. The main retention worker and the forecourt compaction target are both disabled by default, and forecourt compaction remains dry-run by default. `forecourt_events`, tank payloads, unattended duplicate fields, and terminal replay/checkpoint row retention are not changed in this pass.

### Validation

- Focused lifecycle, retention, archive, receipt, print, and fiscal regression set: 40 passed.
- Thirteen changed TypeScript entrypoints bundled successfully with external package resolution.
- Page-boundary architecture validation passed with zero violations.
- Agent metadata regenerated for 1,630 files, 4,391 symbols, 5,653 import edges, 290 API routes, and 42 pages.
- Fourteen JSON files parsed successfully and 52 Markdown files had zero broken local links.
- The full dependency-backed suite, production build, and generated `vpos-server.cjs` refresh remain authenticated deployment-build steps because private Gilbarco packages are unavailable in the analysis environment.

## Pass 12 - TypeScript baseline repair and bounded forecourt evidence

Date: 2026-07-21

### Completed

- Fixed the reported TypeScript database-row generic by constraining fiscal-event query results to PostgreSQL `QueryResultRow`.
- Preserved fiscal-event narrowing across transaction callbacks by capturing the validated event before entering nested transaction functions.
- Replaced the archive policy's dependency on globally augmented `NodeJS.ProcessEnv` with a minimal readonly environment map, allowing isolated test environments without fabricating `NODE_ENV`.
- Added forecourt event retention classes: routine, error, maintenance/security, and field evidence.
- Added bounded, redacted event payload persistence with deterministic source hashes and versioned payload metadata.
- Added independent event retention periods under the existing station-scoped, dry-run-first retention coordinator.
- Added compact, versioned tank-gauge diagnostics and source hashes; new tank updates no longer store the full source response in `last_tg_payload`.
- Added safe legacy tank-payload compaction only after compact diagnostics exist and the configured grace period has elapsed.
- Stopped mirroring unattended receipt/payment JSON into normalized business transactions; typed payment, EPT, receipt, and masked-card fields remain canonical.
- Added recovery-safe compaction for legacy unattended JSON on normalized and raw forecourt transaction rows.
- Added admin/support lifecycle metrics for event classes, tank diagnostics/raw payloads, and remaining unattended duplicates.
- Added PostgreSQL migration `1261_forecourt_event_tank_retention.sql` and documented the rollout controls in `.env.example`, README, architecture, and the storage-reduction plan.

### Compatibility boundary

No production retention or payload clearing is executed by the migration. Existing raw tank payloads are first converted to compact diagnostics and remain present until the disabled-by-default compaction worker is explicitly enabled. Existing unattended JSON remains available until the Phase 4A recovery conditions and grace period are satisfied. Field evidence is bounded and redacted but retained longer than routine telemetry. Terminal replay/checkpoint row deletion and final compatibility-column removal remain later deployment decisions.

### Validation

- The three files from the reported `npm run typescript` failure and all Phase 4B modules pass focused TypeScript compilation.
- Combined archive, retention, receipt, print, fiscal-event, forecourt lifecycle, event-classification, and tank-diagnostic regression set: 55 passed.
- Seventeen changed TypeScript entrypoints bundled successfully with external package resolution.
- Page-boundary architecture validation passed with zero violations.
- Agent metadata regenerated for 1,635 files, 4,402 symbols, 5,663 import edges, 290 API routes, and 42 pages.
- Fourteen JSON files parsed successfully and 52 Markdown files had zero broken local links.
- The full authenticated dependency-backed typecheck, production build, and generated `vpos-server.cjs` refresh remain deployment-pipeline steps because private Gilbarco packages are unavailable in the analysis environment.

## Pass 13 - Canonical JPL recovery payload ownership and terminal row retention

Date: 2026-07-21

### Completed

- Made `forecourt_jpl_transaction_checkpoints` the sole temporary payload owner for supervised and unsupervised controller-clear recovery.
- Changed new supervised replay writes to persist checkpoint payloads first and keep `forecourt_jpl_supervised_replay` metadata-only.
- Added checkpoint-first compatibility reads so existing restore, resume-clear, diagnostics, and admin workflows continue to read legacy replay rows safely.
- Added migration `1262_jpl_checkpoint_replay_retention.sql` to copy legacy replay payloads into matching checkpoints without replacing newer checkpoint data.
- Added replay payload ownership, terminal timestamps, and terminal outcome markers.
- Fixed the live supervised clear path so the replay row is explicitly marked `cleared`; previously only transaction and checkpoint state were finalized.
- Added bounded duplicate replay-payload compaction only after the checkpoint contains all required recovery payload components.
- Extended the generic retention coordinator to support composite-key tables with table-scoped `FOR UPDATE ... SKIP LOCKED` selection.
- Added independent terminal retention for cleared replay rows (14 days by default) and cleared checkpoint rows (30 days by default).
- Required payload clearing, canonical transaction linkage, controller clear, normalized payload clear, no errors, and no foreign lock before terminal rows can be deleted.
- Added admin/support lifecycle metrics for replay payload ownership and remaining terminal rows.

### Compatibility boundary

The migration does not delete terminal rows or null legacy replay payloads. The existing disabled-by-default, dry-run-first retention worker performs both duplicate-payload compaction and terminal deletion. Active, failed, blocked, unresolved, or payload-bearing recovery rows remain ineligible. The original replay payload columns remain for rollback compatibility and can be dropped only after deployed sites have completed a release soak with zero `legacy_replay` owners.

### Validation

- Focused Phase 4C archive, retention, lifecycle, event, tank, and JPL ownership regression set: 29 passed.
- Executable receipt, print, fiscal-event, archive, retention, replay, and lifecycle compatibility set: 70/70 passed. The separate unattended-transaction suite remains excluded because it requires the unavailable private DOMS package.
- Ten changed TypeScript entrypoints bundled successfully with esbuild and external package resolution.
- Page-boundary architecture validation passed with zero violations.
- Agent metadata regenerated for 1,636 files, 4,402 symbols, 5,668 import edges, 290 API routes, and 42 pages.
- The complete authenticated `npm run typescript`, production build, and generated `vpos-server.cjs` refresh remain deployment-pipeline steps.

## Pass 14 - Configuration ownership and storage retirement guardrails

Date: 2026-07-21

### Completed

- Added a central station KV ownership policy with registered exact keys/prefixes, key-specific value validation, payload-size limits, key-shape validation, and compatibility/strict rollout modes.
- Routed setup and proxy configuration writers through the canonical KV persistence boundary and prevented CSRF metadata from being persisted as proxy configuration.
- Applied consistent environment precedence: non-empty process environment, then station `env:*` value, then code default.
- Updated forecourt runtime environment resolution and retained read compatibility for the legacy bare JPL request-dispatch key.
- Removed every active application write to the legacy `station_settings.key` column, including bootstrap and Tanzania fiscal configuration paths.
- Added migration `1263_configuration_ownership_guardrails.sql`; it makes the legacy settings key nullable, removes its uniqueness/index requirement, adds non-destructive KV key/value constraints, and marks unused storage candidates as deprecated without dropping data.
- Added `npm run config:storage:audit` to inspect meaningful legacy values, generic queue rows, oversized/unregistered KV entries, and database view/function/trigger dependencies before a destructive migration.
- Added `docs/CONFIGURATION_OWNERSHIP.md` as the authoritative configuration ownership and precedence contract.

### Compatibility boundary

`station_kv.value_json`, `station_settings.key`, `station_settings.value_json`, and `job_queue` are not dropped in this pass. Strict KV mode is not enabled by default. Each deployment must inventory unregistered keys and run the database audit, then inspect external/site-specific consumers and rollback requirements before destructive removal.

### Validation

- Station KV ownership, type, size, environment-precedence, writer-boundary, migration, and retirement-audit tests pass.
- Focused strict TypeScript compilation covers the changed configuration, setup, forecourt, Tanzania fiscal, bootstrap, and audit modules.
- The complete authenticated dependency-backed typecheck/build remains a deployment-pipeline requirement.

## Pass 15 - Country catalog canonicalization and retirement audit

Date: 2026-07-21

### Completed

- Made `country_datasets` and `country_dataset_rows` the canonical mutable country catalog and retained bundled TypeScript datasets only as immutable bootstrap/reset defaults.
- Added typed country-scoped runtime adapters and migrated remaining tax/fiscal/configuration readers away from direct `cfg_*` access.
- Removed the secondary seed-copy path that repopulated global `cfg_*` tables from canonical rows during setup or admin refresh.
- Added deterministic SHA-256 content hashes that refresh after bootstrap, row mutations, and explicit reset operations.
- Added the explicit `reset-to-bundled-defaults` administrative action so mutable catalog data is never silently overwritten at startup.
- Added migration `1264_country_catalog_canonical.sql` with a non-validating hash constraint, active-catalog index, six country-scoped compatibility views, and a legacy-to-canonical mapping view.
- Added `npm run country:catalog:audit` with explicit-country support, ambiguous-country rejection, canonical completeness/hash checks, row-equivalence comparisons, compatibility-view checks, and PostgreSQL dependency discovery.
- Added `docs/COUNTRY_CATALOG_OWNERSHIP.md` as the durable source-of-truth and retirement contract.

### Compatibility boundary

No `cfg_*` table is dropped, truncated, or cleared in this pass. Compatibility views include `country_code` and intentionally do not replace the unscoped legacy table names. A destructive migration requires a passing audit for every active country, external SQL/reporting migration, captured row counts and hashes, backup/restore and rollback validation, release soak, and retirement of older binaries.

### Validation

- Country catalog policy, hash, source-guard, migration, audit, and bundled-dataset tests: 8/8 passed.
- Expanded configuration, fiscalization, receipt, print, archive, retention, and catalog compatibility set: 83/83 passed. The separate JPL protocol test remains unavailable without the private `@gilbarcoafs/doms-pos-jpl` package.
- Complete repository TypeScript compilation (`tsc -p tsconfig.json --incremental false`) passed using the repository compatibility declarations for the two unavailable private Gilbarco packages.
- Fourteen changed TypeScript entrypoints bundled successfully with external package resolution.
- Page-boundary architecture validation passed with zero violations.

## Pass 16 - Configuration history and PSS parsed-copy retirement

Date: 2026-07-21

### Completed

- Replaced new persisted `pss.xml.parsed` copies with a compact versioned import summary containing source identity, byte size, parsed counts, and normalized-write counts.
- Preserved raw PSS XML as the import/export source, retained the PSS-to-database ID map, and kept normalized products, tanks, pumps, and nozzles in their typed owners.
- Updated admin PSS status to use compact metadata first and derive a compatibility summary from legacy parsed data without returning the full object.
- Added a guarded retention target for legacy parsed PSS rows that requires raw XML, ID map, compact summary, and an elapsed compatibility window.
- Added deterministic normalized JSON hashing for station, plugin, and device configuration versions and suppressed unchanged snapshots.
- Added pin metadata and the `config:versions:pin` operator command to protect identified deployment/rollback versions.
- Added count-based station-scoped retention that keeps the latest 20 versions per owner by default, protects pinned rows, requires a minimum age, and deletes only in bounded `SKIP LOCKED` batches.
- Added non-destructive migration `1265_pss_summary_config_version_retention.sql` and documented the durable ownership, rollout, and rollback contract in `CONFIGURATION_HISTORY_AND_PSS_STORAGE.md`.

### Compatibility boundary

The migration does not remove parsed PSS data or prune configuration history. The existing retention coordinator remains disabled and dry-run by default. Existing parsed rows remain readable while the compatibility release is active, and older application binaries must be retired before those rows are removed. Raw XML compression/encryption remains a later deployment decision based on measured file sizes and key-management requirements.

### Validation

- Exact repository TypeScript compilation passed.
- Phase 5C targeted policy and source-guard set: 31/31 passed.
- All executable tests that do not require the private DOMS/JPL runtime package: 266/266 passed.
- Seventeen changed TypeScript entrypoints bundled successfully with external package resolution.
- Page-boundary architecture validation passed with zero violations.
- Agent metadata regenerated for 1,658 files, 4,459 symbols, 5,743 import edges, 290 API routes, and 42 pages.
- Fourteen JSON files parsed successfully and 55 Markdown files had zero broken local links.
- Sixteen test files remain unavailable in this environment because their runtime import graph requires `@gilbarcoafs/doms-pos-jpl`; the full authenticated suite must run in the deployment environment.

## Pass 17 - Deployment-safe legacy configuration storage retirement

Date: 2026-07-21

### Completed

- Added non-destructive migration `1266_legacy_config_storage_retirement_support.sql` with an operator audit ledger for retirement and compatibility-restore actions.
- Hardened the configuration storage audit so populated `station_settings.key` rows block retirement and absent post-retirement columns/tables are handled without query failures.
- Added explicit `retirementComplete` and `readyToApply` audit states and a post-deployment `--require-retired` assertion.
- Added `npm run config:storage:retire`, which is read-only by default and prints the candidate plan and blockers.
- Required maintenance-window confirmation, an external backup reference, operator identity, application version, and an exact acknowledgement phrase before destructive execution.
- Reran the complete audit under a PostgreSQL transaction advisory lock immediately before the drops, used bounded lock/statement timeouts, and committed only after a post-action audit confirmed complete retirement.
- Isolated destructive SQL to the explicit operator command; normal startup migrations remain non-destructive.
- Added a compatibility-shell restore that recreates nullable legacy columns and an empty `job_queue` while explicitly requiring external backup restoration for historical data or older-binary rollback.
- Added `CONFIGURATION_STORAGE_RETIREMENT.md` as the maintenance, verification, and rollback runbook.

### Compatibility boundary

No production database was modified in this pass. The historical baseline migration remains checksum-protected and still creates the compatibility objects on a fresh database; a deployment must run the explicit retirement command after the complete migration chain. The restore command recreates schema only and does not restore discarded values or queued jobs.

### Validation

- Exact repository TypeScript compilation passed.
- Focused retirement and station-KV policy tests: 16/16 passed.
- All executable tests that do not require the private DOMS/JPL runtime package: 273/273 passed across 70 test files.
- Sixteen DOMS/JPL-dependent test files remain authenticated-registry checks.
- Four changed operational TypeScript entrypoints bundled successfully.
- Page-boundary architecture validation passed with zero violations.
- Agent metadata regenerated for 1,663 files, 4,470 symbols, 5,758 import edges, 290 API routes, and 42 pages.
- Fourteen JSON files parsed successfully and 56 Markdown files had zero broken local links.
- ZIP integrity validation passed.

## Pass 18 - Complete test-suite reliability and private dependency isolation

Date: 2026-07-21

### Completed

- Audited all test modules and corrected the runner so MJS/CJS and test/spec variants are discovered instead of silently omitting non-TypeScript tests.
- Added deterministic test-only fallback imports for unavailable private Gilbarco packages while keeping JPL runtime operations fail-fast.
- Added authenticated vendor-contract tests and explicit `test:vendor` / `test:ci` commands.
- Added test listing, audit, filtering, coverage, concurrency, and timeout controls.
- Added regression coverage for the discovery policy itself.
- Refactored supervisor dependencies so tests inject heartbeat, fiscal recovery, inbox metrics, and sleep behavior instead of contacting PostgreSQL or waiting on production restart delays.
- Replaced timer-based replay and single-flight concurrency tests with deferred-promise coordination.
- Added `docs/TESTING.md` as the durable test strategy and execution contract.

### Compatibility boundary

The fallback private-package modules are loaded only by the test runner when the real packages cannot be resolved. They do not replace authenticated vendor-contract execution and cannot perform JPL runtime operations. Live DOMS/PSS, fiscal endpoint, printer, and database validation remains under the existing integration and commissioning gates.

### Validation

- Complete default suite: 89 files, 523 test nodes, 521 passed, 2 conditional vendor-contract skips, 0 failed.
- Source coverage baseline: 64.93% lines, 75.98% branches, and 64.31% functions.
- Test audit: zero focused `.only`, unconditional skip/todo, or timer-based files.
- Supervisor tests no longer emit PostgreSQL connection warnings and complete without real restart delays.
- Focused TypeScript compilation passed for the changed supervisor and contract-test surfaces.

## Pass 19 - Operational behavioral coverage and focused coverage gates

Date: 2026-07-21

### Completed

- Added behavioral receipt-generation tests covering branding presence/absence, immutable output construction, fiscal response aliases, normalized database-line precedence, raw-item fallback, payment metadata, and QR behavior.
- Added fiscal inbox service and mapper tests covering every supported transition, missing-row behavior, invalid persisted states, mixed snake/camel input, presentation values, and transaction identifier resolution.
- Added dynamic tank-data edge tests for protocol aliases, whitespace normalization, bounded text, missing expiry, invalid density rejection, deterministic hashes, and preservation of explicit zero measurements.
- Added JPL client lifecycle tests for connected/disconnected health, startup failures, missing APC1, local status commands, replay status, direct request dispatch, unsupported commands, and request failures.
- Introduced optional dependency overrides in the receipt generator and JPL lifecycle boundary so behavioral tests do not open sockets or connect to PostgreSQL. Production call signatures remain backward compatible.
- Added named coverage profiles and package scripts for operational services, JPL lifecycle, and the combined focused gate.
- Calibrated subsystem thresholds to lock in measured behavior coverage while treating the monolithic JPL client as a documented decomposition target.

### Validation

- Complete default suite: 93 files, 546 test nodes, 544 passed, 2 conditional vendor-contract skips, 0 failed.
- Global source coverage: 66.01% lines, 75.88% branches, and 66.07% functions.
- Operational-service profile: 96.84% lines, 82.34% branches, and 96.63% functions; enforced floors 90% / 65% / 85%.
- JPL lifecycle profile: 46.54% lines, 58.71% branches, and 22.99% functions; enforced floors 46% / 58% / 22%.
- Focused strict TypeScript compilation passed for all changed source and test modules.
- Test audit found zero focused tests, unconditional skips/todos, or timer-based files.
- Page-boundary architecture validation passed with zero violations.

## Pass 20 - JPL command-family decomposition and coverage uplift

Date: 2026-07-21

### Completed

- Reduced `src/platform/integrations/jpl/client.ts` from approximately 3,000 lines to roughly 2,150 lines while preserving the public `jplHealth` and `jplSendPosCommand` APIs.
- Extracted lifecycle/status, controller-record, pump, basic tank, transaction replay, and direct protocol command families into focused modules under `src/platform/integrations/jpl/commands/`.
- Moved the runtime dependency contract into the command contracts module and re-exported it from the original client path for caller compatibility.
- Kept access checks, gateway startup, APC1 serialization, protocol normalization, pricing, aggregate tank delivery, and dynamic tank behavior in the facade until their own extraction passes.
- Added deterministic behavioral tests for every extracted handler, including validation failures, request construction, identifier normalization, persistence callbacks, and unsupported-command fallthrough.
- Added facade-level routing tests for extracted pump, tank, and transaction commands.
- Added an architecture guard that prevents extracted command branches from returning to the client facade and caps facade growth below 2,300 lines.
- Expanded the `jpl-client` coverage profile to include the command modules and raised its enforced floors from 46% / 58% / 22% to 59% / 85% / 50%.

### Compatibility boundary

The public JPL facade signatures and command result shapes are unchanged. This pass does not modify gateway connection behavior, APC1 queueing, command schemas, persistence ownership, or live DOMS/JPL deployment requirements. Pricing, dynamic tank data, aggregate tank delivery, and protocol helper extraction remain future work.

### Validation

- Exact repository TypeScript compilation passed.
- Complete default suite: 95 files, 559 test nodes, 557 passed, 2 conditional vendor-contract skips, 0 failed.
- Global source coverage: 66.56% lines, 76.76% branches, and 66.61% functions.
- JPL client/handler profile: 60.08% lines, 87.02% branches, and 54.81% functions; enforced floors 59% / 85% / 50%.
- Extracted handler modules individually report approximately 99-100% line and function coverage.
- Test audit found zero focused tests, unconditional skips/todos, or timer-based files.
- Page-boundary architecture validation passed with zero violations.
- All eight changed JPL source entrypoints bundled successfully.
- Agent metadata regenerated for 1,684 files, 4,489 symbols, 5,829 import edges, 290 API routes, and 42 pages.
- Fourteen JSON files parsed successfully; 57 Markdown files had zero broken local links.

## Pass 21 - Remaining JPL command extraction and protocol coverage

Date: 2026-07-22

### Completed

- Reduced `src/platform/integrations/jpl/client.ts` from 2,149 lines to 690 lines while preserving the public `jplHealth` and `jplSendPosCommand` APIs.
- Extracted price-set reads, pending-price handling, price-bank normalization, scheduling, and clearing into `commands/pricing.ts`.
- Extracted dynamic tank reads, updates, error reads, configured-tank fan-out, and per-tank failure isolation into `commands/dynamicTank.ts`.
- Extracted aggregate tank-delivery candidate discovery, site/TgStatus fallback, delivery reads, normalization, clear targets, and checkpoint summaries into `commands/delivery.ts`.
- Centralized request timeout, protocol reject parsing, unknown-subcode detection, command variants, and subcode fallback under `protocol/runtime.ts`.
- Centralized response-envelope unwrapping and bounded gateway snapshots under `protocol/snapshots.ts`.
- Added deterministic behavioral tests for pricing transforms and controller fallbacks, dynamic-tank partial failures, aggregate-delivery fallbacks, shared protocol behavior, every gateway snapshot family, and facade architecture.
- Tightened the facade architecture guard to 800 lines and prohibited shared protocol/helper definitions from returning to `client.ts`.
- Added the `jpl-remaining-commands` coverage profile and `test:coverage:jpl-remaining` command.

### Compatibility boundary

The JPL facade exports, command types, command result shapes, APC1 serialization, access checks, gateway startup, and protocol request schemas are unchanged. Dependency overrides are test seams only; production calls resolve the existing implementations. Live controller and private-package contract validation remain authenticated-environment gates.

### Validation

- Isolated behavioral and architecture set: 22/22 passed.
- Extracted pricing/dynamic-tank/delivery/protocol profile: 89.78% lines, 72.80% branches, and 97.01% functions; enforced floors 85% / 65% / 90%.
- Focused strict TypeScript compilation passed for the six changed source modules.
- Ten changed TypeScript source/test files transpiled successfully.
- Test inventory: 98 files; zero focused `.only`, unconditional skip/todo, or timer-based files.
- Page-boundary architecture validation passed with zero violations.
- The complete repository suite, aggregate JPL coverage profile, exact repository typecheck, and production build require the dependency-complete authenticated environment and were not rerun in this isolated packaging environment.

## Pass 22 - JPL pricing decomposition and branch coverage

Date: 2026-07-22

### Completed

- Replaced the 843-line pricing handler with a 34-line compatibility facade and focused contracts, mapping, protocol, read, scheduling, and routing modules.
- Preserved every existing pricing export and the public `handlePricingCommand` call shape, so the JPL client and application callers require no migration.
- Isolated price/date normalization, DOMS price-bank mapping, controller subcode fallback, current/pending reads, clear operations, scheduling validation, replacement behavior, and post-schedule verification.
- Added direct behavioral tests for numeric/date aliases, incomplete matrices, scalar/list price inputs, missing pending matches, specific-pending read failures, degraded controller capabilities, default clear values, missing active banks, controller-bank precedence, fallback-subcode warnings, and exact pending replacement.
- Added a dedicated `jpl-pricing` coverage profile and included the extracted pricing modules in the aggregate JPL profiles.
- Added architecture guards that keep `commands/pricing.ts` below 60 lines, prevent pricing logic from returning to the facade, and cap each extracted module by responsibility.

### Compatibility boundary

The JPL facade API, command names, request envelopes, response shapes, subcode fallback order, warning text, and pending-price behavior remain unchanged. The new modules are internal ownership boundaries. Live controller validation and private-package contract tests remain authenticated-environment gates.

### Validation

- Focused pricing behavior: 14/14 passed.
- JPL pricing/client architecture: 2/2 passed.
- Extracted pricing mapping/read/scheduling coverage: 98.71% lines, 87.96% branches, and 100% functions.
- Focused strict TypeScript compilation passed for all extracted pricing source modules.
- Test audit: 99 files, zero focused `.only`, unconditional skip/todo, or timer-based files.
- Page-boundary architecture validation passed with zero violations.

## Pass 23 - JPL status/read extraction and degraded-subcode coverage

Date: 2026-07-22

### Completed

- Reduced `src/platform/integrations/jpl/client.ts` from 690 lines to 374 lines while preserving `jplHealth`, `jplSendPosCommand`, APC1 serialization, and all command/result shapes.
- Moved fuelling-point status/info/fuelling/error reads, tank and delivery reads, controller status reads, service-log operations, back-office record reads, and simple wetstock requests into `protocol/statusReads.ts`.
- Added deterministic controller-degradation tests for requested subcodes, fallback ordering, transport failures that must not fall back, response normalization, delivery item defaults, and clear operations.
- Added an authenticated private-package contract for the degraded FpStatus, FpFuellingData, TgStatus, and SiteDeliveryStatus subcodes.
- Added the `jpl-status-reads` coverage profile and included the reader suite in the aggregate `jpl-client` profile.
- Tightened architecture limits to 450 lines for `client.ts` and 380 lines for `statusReads.ts`.
- Raised the aggregate JPL coverage floor from 60% / 85% / 52% to 88% / 85% / 90%.

### Compatibility boundary

The public JPL client API, command routing, request envelopes, snapshot behavior, fallback ordering, persistence ownership, and runtime access checks are unchanged. The new module is an internal ownership boundary. The authenticated vendor contract remains conditional when the private package is unavailable.

### Validation

- JPL-focused execution: 63/63 test nodes passed.
- New status/read behavior: 9/9 passed.
- Status/read coverage: 96.81% lines, 90.24% branches, and 100% functions; enforced floors 95% / 88% / 95%.
- Aggregate JPL coverage: 90.31% lines, 88.31% branches, and 94.21% functions; enforced floors 88% / 85% / 90%.
- Architecture/status/contract set: 12 passed, 1 conditional vendor skip, 0 failed.
- Test audit: 101 files, zero focused `.only`, unconditional skip/todo, or timer-based files.
- Changed TypeScript source and test files transpiled without syntax diagnostics.

The complete repository test suite, exact dependency-backed TypeScript command, authenticated vendor contract, and production build remain deployment-environment gates.

## Pass 24 - JPL orchestration and special-record persistence coverage

Date: 2026-07-22

### Completed

- Reduced `src/platform/integrations/jpl/client.ts` from 374 lines to 289 lines while preserving `jplHealth`, `jplSendPosCommand`, and all command/result shapes.
- Extracted gateway-start coordination and APC1 command serialization into `src/platform/integrations/jpl/orchestration.ts`.
- Added single-flight gateway startup so concurrent commands share one startup attempt, while failed startup attempts reset cleanly for later recovery.
- Added an injectable command-queue seam to the runtime dependency contract without changing production callers.
- Extracted service-message and back-office evidence persistence into `src/platform/integrations/jpl/specialRecordPersistence.ts`.
- Made evidence persistence explicitly non-throwing: repository failures return a typed failed outcome and emit bounded diagnostics without stack traces.
- Added explicit skip outcomes for missing service/back-office sequence numbers and empty back-office records.
- Normalized blank service-message sequence numbers to `undefined` so blank identifiers cannot be persisted as keys.
- Added deterministic tests for APC1 serialization, queue recovery after rejection, gateway-start coalescing, startup retry, missing clients, default facade queueing, persistence failures, empty records, and bounded diagnostics.
- Added the `jpl-orchestration` coverage profile and included orchestration/persistence in the aggregate JPL coverage profile.
- Tightened the client facade architecture limit from 450 lines to 330 lines and prohibited queue/persistence helpers from returning to the facade.

### Compatibility boundary

The public JPL facade APIs, command schemas, access checks, controller request envelopes, response shapes, and database repository ownership are unchanged. The optional queue dependency is a test seam; production uses the shared APC1 queue. Evidence persistence remains best-effort by design so successful controller reads are not converted into command failures by a local database outage.

### Validation

- Focused orchestration/persistence execution: 43/43 test nodes passed.
- Aggregate JPL execution: 78/78 test nodes passed.
- Orchestration/persistence coverage: 91.84% lines, 82.58% branches, and 97.30% functions; enforced floors 90% / 80% / 95%.
- Aggregate JPL coverage: 95.13% lines, 88.48% branches, and 98.48% functions; enforced floors 93% / 87% / 95%.
- Focused strict TypeScript compilation passed for the changed source and test modules.
- Test audit: 103 files, zero focused `.only`, unconditional skip/todo, or timer-based files.
- Page-boundary architecture validation passed with zero violations.
- The complete dependency-backed repository suite, exact full TypeScript command, authenticated vendor contracts, and production build remain local authenticated-environment gates.
