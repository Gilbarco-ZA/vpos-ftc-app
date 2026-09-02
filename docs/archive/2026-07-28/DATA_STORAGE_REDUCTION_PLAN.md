# Data Storage Reduction and Ownership Plan

**Status:** Repository-verified; implementation passes through Phase 5D are complete behind deployment-safe rollout gates; site execution and final compatibility drops remain staged  
**Verified against repository:** 2026-07-21  
**Scope:** PostgreSQL, active Azure SQL mirrors, sync payloads, queue tables, fiscalization, receipts, printing, forecourt/DOMS, configuration, country datasets, PSS XML state, archive data, and repository documentation.

## 1. Purpose

The application currently stores several payloads in more than one table or column. Some duplication is intentional and necessary—for example, a normalized business row plus a bounded raw integration payload, or an immutable receipt snapshot required for reprinting. Other duplication is accidental, unbounded, or unclear, which causes:

- unnecessary local and cloud storage growth;
- larger sync payloads;
- conflicting read paths;
- ambiguity over which table owns a value;
- migration and support complexity;
- stale data surviving after its operational purpose has ended.

This plan defines one owner for each data class, distinguishes canonical data from derived or transient data, and provides a safe migration sequence. It supersedes the earlier unverified version of this document.

## 2. Verification method

The findings were checked against:

- PostgreSQL and Azure SQL migrations;
- transaction and fiscalization repositories;
- receipt generation and receipt APIs;
- print queue writers and workers;
- sync table specifications and serialization;
- forecourt/DOMS persistence and replay code;
- archive event and archive export code;
- station configuration and `station_kv` accessors;
- PSS XML import/export code;
- country dataset bootstrap and runtime configuration readers;
- queue workers and current cleanup scripts;
- repository documentation references.

A finding is marked **verified** only where the schema and at least one writer or reader were traced. Destructive actions still require deployment-level validation against the actual site database and compliance requirements.

## 3. Executive conclusions

The original plan was directionally correct, but the following corrections are required:

1. `transactions.fiscalization_response` cannot yet be dropped. Phase 3B now provides idempotent backfill and a guarded events-only sync mode, but production must run the backfill and complete a zero-fallback soak before the compatibility field is removed from sync or schema.
2. `print_jobs` already has `source_transaction_id` and `source_report_id`; reference-based printing does not require a new reference column.
3. Receipt HTML is derived from plain text in the current renderer, but `fiscal_data` and `branding_snapshot` are not equivalent duplication and should remain as bounded immutable snapshots.
4. `archive_events` is a higher-priority storage issue than previously stated. The runtime subscribes to every bus message and persists the full payload, while archive exports are explicitly deprecated and disabled.
5. Existing audit and VPOS log cleanup functions are one-shot utilities; they are not automatically scheduled by the current runtime composition.
6. PSS XML raw content must remain available while export is supported. The parsed JSON copy is the removable duplicate.
7. Phase 5B makes `country_dataset_rows` the canonical mutable country catalog because it is country-scoped and admin-managed. Active runtime readers no longer use `cfg_*`; the legacy tables remain deployment-gated compatibility storage until database and external-consumer audits pass.
8. Successful fiscal evidence may be subject to statutory retention. Do not apply a generic “last N rows” rule to successful fiscalization events without compliance approval.
9. Queue failures and dead-letter records must have a longer, separately controlled retention period than successful queue rows.
10. Active Azure SQL and sync code still exists. Any column or table used by a synced entity needs coordinated local, cloud, and compatibility handling.

## 4. Verified findings

| Area               | Finding                                                                                                                       | Verification                                                        | Decision                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fiscalization      | Older code wrote a full result to both `transactions.fiscalization_response` and `fiscalization_events.response_payload`.     | Verified and corrected in Phases 3A and 3B.                         | New writes and legacy importers use one canonical event. Existing full rows can be idempotently backfilled and compacted to summaries.                 |
| Fiscal proxy       | Proxy submission and reconciliation previously used the transaction response column as the working payload store.             | Verified and corrected in Phase 3A.                                 | One proxy event now moves from `PENDING` to `SUCCESS`/`FAILED`; reconciliation reads the event first and only falls back for legacy rows.              |
| Sync               | Fiscal event payloads and the transaction compatibility field are both synced.                                                | Verified in `syncTableSpecs.ts` and sync repositories.              | Compatibility remains the default. A guarded `events-only` mode removes only the duplicate field after local/cloud readiness and soak acknowledgement. |
| Receipts           | `html_content`, `plain_text_content`, fiscal data, and branding are all stored. HTML is generated from plain text.            | Verified in receipt builder and receipt persistence.                | Keep plain text as canonical render content; generate HTML on read; retain minimal fiscal and branding snapshots.                                      |
| Printing           | Auto-print embedded the complete receipt payload although the receipt row was also inserted.                                  | Verified in transaction fiscalization completion.                   | Phase 2A implemented reference-only transaction/report jobs with dual-read compatibility for legacy embedded jobs.                                     |
| Print schema       | `print_jobs` already contains source transaction/report references.                                                           | Verified in migrations and print repository.                        | No new reference column is needed.                                                                                                                     |
| Runtime archive    | Every runtime bus message is persisted with its full payload.                                                                 | Verified in `startArchiveBusListener()` and `archiveEventsRepo.ts`. | Disable by default or allowlist compact event summaries; do not archive all bus payloads.                                                              |
| Archive export     | S3/SFTP archive exports are deprecated and all export operations are disabled/no-op.                                          | Verified in `archiveExports.ts`.                                    | Do not base retention on “successful export”; retire export tables after deployment verification.                                                      |
| Forecourt          | The same raw transaction can exist in `forecourt_events`, `forecourt_transactions.raw`, and `transactions.doms_payload_json`. | Verified in forecourt persistence and JPL transaction upsert code.  | Keep bounded event diagnostics and one temporary raw transaction source; clear raw data after durable normalization and reconciliation.                |
| Replay/checkpoints | Several replay/checkpoint rows retain JSON payloads after terminal states.                                                    | Verified in forecourt recovery repositories.                        | Delete terminal rows or null large payload columns after a confirmed completion marker.                                                                |
| Tank data          | `tanks.last_tg_payload` stores a full source response alongside normalized tank fields.                                       | Verified in tank persistence.                                       | Keep compact diagnostic metadata only, or move raw evidence to the bounded forecourt event store.                                                      |
| PSS XML            | Import stores raw XML, parsed JSON, ID map, checksum, timestamps, and normalized rows.                                        | Verified in `pssXmlImporter.ts`.                                    | Keep raw XML, checksum, ID map, and compact import summary; remove parsed JSON.                                                                        |
| Country catalog    | Bundled defaults previously populated `country_dataset_rows` and were then copied into global `cfg_*` runtime tables.         | Verified and corrected in Phase 5B.                                 | Runtime/admin reads now share country-scoped canonical rows; compatibility views and audits gate later `cfg_*` retirement.                             |
| KV schema          | `station_kv.value_json` has no runtime reader/writer; code uses `value`.                                                      | Verified by repository-wide reference search.                       | Explicit retirement command implemented; each site must pass the same-transaction audit and backup/maintenance gate before drop.                       |
| Station settings   | Legacy `station_settings.key` and `value_json` are not used by current typed settings code.                                   | Verified by repository-wide reference search.                       | Explicit retirement is available only when both columns are empty/dependency-free and all older processes are stopped.                                 |
| Generic jobs       | `job_queue` exists in migrations but has no runtime code references.                                                          | Verified by repository-wide reference search.                       | Explicit `RESTRICT` drop is available only when the table is empty and has no database dependencies.                                                   |
| Config history     | Station, plugin, and device configuration version tables append versions without pruning.                                     | Verified in save repositories.                                      | Retain a bounded number plus protected deployment versions.                                                                                            |
| Cleanup scheduling | Audit/log cleanup functions exist but are not wired into the active composition root.                                         | Verified in cleanup scripts and runtime startup.                    | Add an idempotent scheduled retention service or an external scheduled command.                                                                        |
| Documentation      | Refactor pass notes duplicate the consolidated pass history; generated live evidence is committed at repository root.         | Verified by content and reference analysis.                         | Remove redundant pass/design notes, ignore generated evidence, and use a documentation index.                                                          |

## 5. Data ownership rules

### 5.1 Definitions

- **Canonical:** the authoritative persisted representation used for normal reads and writes.
- **Immutable snapshot:** a deliberately frozen subset retained to reproduce a legal, financial, or user-visible result.
- **Derived:** reproducible from canonical data and not normally persisted.
- **Transient:** required only while work is pending, retryable, or being reconciled.
- **Diagnostic:** bounded evidence retained for support, never the primary business record.
- **Seed:** source-controlled bootstrap input, not an ongoing runtime owner.

### 5.2 Target ownership matrix

| Data class                     | Canonical owner                                                                       | Allowed secondary representation                                          | Must be removed or bounded                                  |
| ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Transaction business state     | `transactions` and normalized child rows                                              | Compact fiscal reference/status; temporary integration correlation fields | Full fiscal response body; terminal raw DOMS payload        |
| Fiscal attempts                | `fiscalization_events`                                                                | Minimal receipt fiscal snapshot                                           | Full duplicate in `transactions`; unbounded failed attempts |
| Rendered receipt content       | `receipts.plain_text_content`                                                         | Generated HTML; minimal immutable branding/fiscal snapshots               | Persisted HTML for new receipts after migration             |
| Print work                     | `print_jobs` state plus source reference                                              | Tiny printer/routing options                                              | Embedded receipt/report bodies                              |
| Reports                        | `reports`                                                                             | Print job reference                                                       | Embedded report copy in print queue                         |
| Forecourt business transaction | Normalized `transactions` and transaction lines                                       | Temporary raw row until normalized/reconciled                             | Multiple permanent raw payload copies                       |
| Forecourt observability        | `forecourt_state` for latest state; bounded `forecourt_events` for recent diagnostics | Compact support bundle export                                             | Indefinite event retention; duplicate wildcard archive copy |
| Queue work                     | Queue row while pending/retryable                                                     | Compact terminal error metadata for a bounded period                      | Successful terminal payloads retained indefinitely          |
| Runtime bus audit              | Purpose-specific audit/event tables                                                   | Allowlisted compact archive summaries only when justified                 | Wildcard full-payload `archive_events` writer               |
| Station settings               | Typed `station_settings` columns                                                      | Explicit environment override keys in `station_kv`                        | Legacy generic key/value columns                            |
| Process configuration          | `station_config` current row                                                          | Bounded version history                                                   | Unbounded versions; duplicate typed settings in KV          |
| Plugin/device configuration    | Current plugin/device tables                                                          | Bounded version history                                                   | Unbounded versions                                          |
| PSS configuration import       | Raw XML + ID map + normalized runtime rows                                            | Compact import summary and checksum                                       | Full parsed JSON copy                                       |
| Country codes/catalogs         | `country_datasets` + `country_dataset_rows`                                           | Bundled source-controlled seed                                            | Permanent duplicate `cfg_*` data                            |
| Security/operator actions      | `audit_logs`                                                                          | Bounded application logs                                                  | Duplicate wildcard archive payload                          |
| Generated validation evidence  | External/site evidence store or ignored local file                                    | Ticket/reference in release gate                                          | Committed machine-specific report files                     |

## 6. Required invariants

Implementation must preserve these invariants:

1. A fiscalized transaction can always reproduce its legally required receipt.
2. A print retry can load the same immutable receipt or report even after application restart.
3. A DOMS transaction is never cleared from its raw recovery source before normalized persistence is committed.
4. A queue cleanup never deletes pending, processing, retryable, or unresolved dead-letter work.
5. Successful fiscal evidence is retained according to country/site compliance policy.
6. Older application versions are not deployed during a destructive schema migration window.
7. Local and cloud schemas remain compatible for every synced table.
8. Support can identify why a failed fiscalization, print, or forecourt operation failed without retaining every full payload indefinitely.
9. Retention jobs are idempotent, station-scoped where required, lock-safe, and observable.
10. Every table/column targeted for deletion has a zero-reader and zero-writer proof from code, database objects, and deployment scripts.

## 7. Retention policy

These are operational defaults, not legal retention rules. Fiscal and accounting retention requires country-specific approval.

| Store/state                           |                               Default | Notes                                                    |
| ------------------------------------- | ------------------------------------: | -------------------------------------------------------- |
| `print_jobs` `DONE`                   |                                7 days | Delete after source receipt/report is confirmed present. |
| `print_jobs` terminal `FAILED`        |                               30 days | Keep compact error and routing context; redact secrets.  |
| `transaction_queue` `DONE`            |                                7 days | Delete only terminal successful rows.                    |
| `transaction_queue` terminal failures |                            30–90 days | Longer period for unresolved/dead-letter rows.           |
| `report_queue` `DONE`                 |                               14 days | Reports remain in `reports`.                             |
| `report_queue` terminal failures      |                               30 days | Keep failure summary, not full redundant output.         |
| `fiscal_inbox` `PROCESSED`            |                               30 days | Confirm linked transaction and fiscal event exist.       |
| `fiscal_inbox` `DEAD`/manual review   |              90 days after resolution | Do not purge unresolved cases.                           |
| `forecourt_events` routine telemetry  |                                7 days | Event-type overrides may retain critical events longer.  |
| `forecourt_events` errors/maintenance |                               30 days | Prefer compact summaries.                                |
| `archive_events`                      |            7 days maximum if retained | Preferred action is disabling wildcard archival.         |
| `audit_logs`                          |  Existing policy, compliance-approved | Automate the existing cleanup policy.                    |
| application/VPOS logs                 |                       Existing policy | Automate the existing cleanup utility.                   |
| config version tables                 |                   latest 20 per owner | Preserve explicitly pinned deployment/rollback versions. |
| failed fiscalization attempts         | 180 days or latest 10 per transaction | Compliance and support approval required.                |
| successful fiscalization events       |                 statutory/site policy | Never use generic queue retention.                       |
| generated validation files            |                         not committed | Store externally when they form deployment evidence.     |

Retention settings should be configurable and validated, for example:

```env
VPOS_RETENTION_ENABLED=false
VPOS_RETENTION_DRY_RUN=true
VPOS_RETENTION_CLEANUP_INTERVAL_MS=21600000
VPOS_RETENTION_BATCH_SIZE=500
VPOS_RETENTION_MAX_BATCHES=10
VPOS_RETENTION_PRINT_DONE_DAYS=7
VPOS_RETENTION_PRINT_FAILED_DAYS=30
VPOS_RETENTION_TRANSACTION_QUEUE_DONE_DAYS=7
VPOS_RETENTION_TRANSACTION_QUEUE_FAILED_DAYS=90
VPOS_RETENTION_REPORT_QUEUE_DONE_DAYS=14
VPOS_RETENTION_REPORT_QUEUE_FAILED_DAYS=30
VPOS_RETENTION_FISCAL_INBOX_PROCESSED_DAYS=30
VPOS_RETENTION_FISCAL_INBOX_RESOLVED_DEAD_DAYS=90
VPOS_RETENTION_AUDIT_LOG_DAYS=30
VPOS_RETENTION_VPOS_LOG_DAYS=30
VPOS_RETENTION_FORECOURT_ROUTINE_DAYS=7
VPOS_RETENTION_FORECOURT_ERROR_DAYS=30
VPOS_RETENTION_CONFIG_VERSIONS=20
```

Do not expose a setting that can shorten statutory fiscal retention below an approved minimum.

## 8. Implementation phases

### Phase 0 — Baseline, ownership guardrails, and compatibility map

#### Actions

- [ ] Capture row counts, total/column sizes, and 7-day growth for all target tables.
- [ ] Record active PostgreSQL and Azure SQL schema versions at every deployment.
- [ ] Record which sync entities are enabled at each site.
- [ ] Add a data ownership registry in code or documentation that identifies canonical owner, writer, reader, retention, and sensitivity.
- [ ] Add tests that prevent new full-payload writes to deprecated columns.
- [ ] Confirm legal retention requirements for Tanzania, Kenya, and other deployed countries.
- [ ] Confirm whether any external reporting, support, or SQL scripts read candidate columns/tables.
- [ ] Fix or reconcile schema drift before relying on clean-database tests. A current example is the `forecourt_state` persistence path inserting an `id` although the reviewed migration does not define that column.
- [ ] Confirm only one current application version will run during each destructive migration.

#### Exit criteria

- Baseline report is saved outside production tables.
- Every target has a named owner and rollback path.
- Compliance and deployment compatibility constraints are documented.

### Phase 1 — Stop unbounded duplicate writers and automate retention

This phase produces immediate savings without changing canonical business reads.

#### 1A. Runtime archive

- [x] Disable `startArchiveBusListener()` by default.
- [x] If archive events are still required, replace wildcard persistence with an allowlist.
- [x] Persist only a compact schema: event type, station, correlation/request ID, outcome, selected identifiers, timestamp, and sanitized error summary.
- [x] Never store credentials, tokens, full receipts, full fiscal payloads, or full DOMS messages in the archive stream.
- [x] Add age-based cleanup independent of export status.
- [ ] Verify no supported workflow relies on deprecated S3/SFTP archive functions.
- [ ] After a soak period, drop `archive_export_destinations`, `archive_exports`, and `archive_export_attempts` if no deployment uses them.
- [ ] Decide whether `archive_events` itself should be dropped or retained as a compact bounded event table.

Feature flag during rollout:

```env
VPOS_RUNTIME_ARCHIVE_MODE=off
# allowed values: off, compact-allowlist

# Required when compact-allowlist is enabled. Patterns may be topic,
# topic:messageType, topic:*, *:messageType, or an explicit *.
VPOS_RUNTIME_ARCHIVE_ALLOWLIST=pos:fiscalAuthResponse,forecourt:criticalAlarm

# Diagnostic archive retention. Set to 0 only to disable cleanup explicitly.
VPOS_RUNTIME_ARCHIVE_RETENTION_DAYS=30
VPOS_RUNTIME_ARCHIVE_CLEANUP_INTERVAL_MS=21600000
VPOS_RUNTIME_ARCHIVE_CLEANUP_BATCH_SIZE=1000
VPOS_RUNTIME_ARCHIVE_CLEANUP_MAX_BATCHES=10
```

Implemented in this pass:

- `runtimeArchivePolicy.ts` provides fail-closed mode parsing, explicit allowlist matching, and compact payload construction.
- `startArchiveBusListener()` starts no wildcard subscriber while mode is `off`, and stores only the compact diagnostic envelope when enabled.
- `archiveRetention.ts` runs immediate and interval-based cleanup in bounded batches under a PostgreSQL transaction advisory lock.
- migration `1254_runtime_archive_retention.sql` adds the `(created_at, id)` cleanup index.
- runtime policy and source-guard tests prevent reintroduction of full bus payload persistence.

#### 1B. Queue and inbox retention

- [x] Add a retention repository that deletes in small batches using indexed terminal-state predicates.
- [x] Separate successful terminal retention from failed/dead-letter retention.
- [x] Add `resolved_at` where a dead/manual-review record currently has no durable resolution timestamp.
- [x] Emit cleanup metrics: examined, deleted, skipped, oldest remaining, duration, and error.
- [x] Use a PostgreSQL advisory lock so only one cleanup process runs per station/deployment.
- [x] Schedule the existing audit and VPOS log cleanup logic through the same retention service.
- [x] Ensure cleanup is safe when the runtime is offline for extended periods.

Implemented in Pass 6:

- `src/platform/retention/storageRetentionPolicy.ts` validates feature flags, per-store age limits, batch size, maximum batches, and cleanup cadence.
- `storageRetentionTargets.ts` defines hard-coded, station-scoped eligibility predicates. It never targets `PENDING`, `PROCESSING`, retryable failures, or unresolved `DEAD` inbox rows.
- `storageRetention.ts` runs immediate and scheduled retention under a station-specific PostgreSQL advisory lock, with bounded `FOR UPDATE SKIP LOCKED` batches, per-target savepoints, lock/statement timeouts, dry-run support, structured metrics, and an explicit stop handle for clean runtime restarts.
- Successful print, transaction, and report queue rows are eligible only after the corresponding canonical receipt/transaction/report exists.
- Failed transaction and report rows are eligible only when `next_attempt_at IS NULL`; retryable failures remain protected.
- `fiscal_inbox.resolved_at` records processing resolution and marks a `DEAD` source as resolved after clone-and-requeue. Requeue/failure/dead transitions clear it, and unresolved `DEAD` rows are never retention-eligible.
- Existing audit/session and VPOS log cleanup scripts now route through the same bounded retention coordinator. Active VPOS logs use `updated_at`, avoiding deletion of a live log row merely because its original `created_at` is old.
- Migration `1255_queue_and_log_retention.sql` adds `resolved_at` and partial/indexed retention paths.

Safe rollout controls and defaults:

```env
VPOS_RETENTION_ENABLED=false
VPOS_RETENTION_DRY_RUN=true
VPOS_RETENTION_CLEANUP_INTERVAL_MS=21600000
VPOS_RETENTION_BATCH_SIZE=500
VPOS_RETENTION_MAX_BATCHES=10

VPOS_RETENTION_PRINT_DONE_DAYS=7
VPOS_RETENTION_PRINT_FAILED_DAYS=30
VPOS_RETENTION_TRANSACTION_QUEUE_DONE_DAYS=7
VPOS_RETENTION_TRANSACTION_QUEUE_FAILED_DAYS=90
VPOS_RETENTION_REPORT_QUEUE_DONE_DAYS=14
VPOS_RETENTION_REPORT_QUEUE_FAILED_DAYS=30
VPOS_RETENTION_FISCAL_INBOX_PROCESSED_DAYS=30
VPOS_RETENTION_FISCAL_INBOX_RESOLVED_DEAD_DAYS=90
VPOS_RETENTION_AUDIT_LOG_DAYS=30
VPOS_RETENTION_VPOS_LOG_DAYS=30
```

Enable the worker in dry-run mode first, review per-target metrics, then set `VPOS_RETENTION_DRY_RUN=false` only after site and compliance approval. A retention value of `0` disables that target. Legal and site-specific retention approval remains mandatory before enabling destructive audit, fiscal inbox, or failed-work cleanup.

#### 1C. Generic `job_queue`

- [x] Add a deployment audit for database views, materialized views, functions, triggers, row counts, external scripts, and site-specific jobs.
- [x] Mark the table deprecated for one release and prevent new application use.
- [ ] Drop it and its trigger/indexes after a passing deployment audit and zero-use soak.

#### Exit criteria

- New wildcard bus messages no longer create full archive rows.
- Terminal queues show bounded growth.
- Retention metrics are available to operations.
- No pending/retryable work is removed.

### Phase 2 — Reference-based printing and receipt render consolidation

#### 2A. Print queue

Use existing `source_transaction_id` and `source_report_id`.

Target receipt job:

```json
{
  "jobType": "print.receipt",
  "sourceTransactionId": "<transaction-id>",
  "payload": {
    "receiptId": "<receipt-id>",
    "printerKey": "<optional-printer-key>",
    "width": 42
  }
}
```

Target report job:

```json
{
  "jobType": "print.report",
  "sourceReportId": "<report-id>",
  "payload": {
    "printerKey": "<optional-printer-key>",
    "width": 48
  }
}
```

Actions:

- [x] Insert/update the receipt before enqueueing a print job.
- [x] Stop embedding `receiptPayload`, plain text, HTML, line arrays, fiscal payloads, and branding in new reference-backed transaction/report jobs.
- [x] Update `handlePrintJob()` to load the receipt/report by station-scoped source ID.
- [x] Prefer immutable receipt ID over regenerating from mutable transaction state.
- [x] Keep compatibility reading for legacy embedded jobs until old queues drain.
- [x] Verify printer selection still resolves from explicit printer key, transaction pump, or default printer.
- [x] Add a foreign-key-safe cleanup order: print jobs first, then only records eligible under separate business retention.
- [x] Add payload-size regression tests.

Implemented in Pass 7:

- New transaction receipt and report writers use `payloadMode: 'reference'` and persist only compact routing/options metadata plus the existing source columns.
- The worker claims both `source_transaction_id` and `source_report_id`, resolves canonical rows within the same station, and uses an exact receipt ID when supplied.
- Legacy job types `TRANSACTION_RECEIPT` and `REPORT` normalize to `print.receipt` and `print.report`; legacy embedded ESC/POS, line-array, text, and report payloads remain readable.
- Specialized embedded receipt formats, including credit notes, retain ownership of their printable payload and are never substituted with the ordinary transaction receipt merely because they carry a transaction reference for printer routing.
- Generic POS print jobs and credit-note jobs remain embedded until a purpose-specific canonical receipt owner exists. This is an explicit compatibility boundary, not a candidate for automatic compaction.
- Migration `1256_reference_based_print_jobs.sql` is data-only: it canonicalizes legacy job types outside active processing and applies the same strict compact-key allowlist only to pending ordinary transaction-receipt/report jobs with a verified canonical source. It does not compact processing jobs or specialized receipt sources.
- The obsolete duplicate print SQL definition under `src/platform/db/queries/printJobs.sql.ts` was removed after confirming no source imports.

No reference-column schema change was required because the columns already existed. Migration `1256` changes only compatible queued data and column documentation.

#### 2B. Receipt HTML

Target:

- `plain_text_content`: canonical printable receipt content.
- `html_content`: nullable compatibility field, not written for new receipts after cutover.
- HTML API response: generated from canonical plain text.
- `fiscal_data`: minimal immutable fields required to display/verify the receipt.
- `branding_snapshot`: minimal immutable fields required to reproduce the original presentation.

Actions:

- [x] Extract the current text-to-HTML renderer into a reusable pure function.
- [x] Change receipt reads to generate HTML when `html_content` is null.
- [x] Continue returning stored HTML for legacy receipts during compatibility.
- [x] Make `html_content` nullable in PostgreSQL and any active Azure mirror.
- [x] Stop syncing new derived HTML.
- [x] Do not backfill HTML; generate it on demand.
- [x] Add a version to the canonical receipt render model if future renderer changes could alter legal output.
- [x] Bound `fiscal_data` and `branding_snapshot` with explicit typed schemas; do not store the full fiscal response.

Implemented in Pass 8:

- `src/shared/receipts/receiptContent.ts` owns versioned deterministic HTML generation and dual-read compatibility. Stored legacy HTML is returned unchanged; plain-text-only rows generate escaped HTML using the row's `render_version`.
- New receipt writes persist `html_content = NULL`, non-empty `plain_text_content`, and `render_version = 1`. Receipt generation no longer builds HTML on the fiscalization write path.
- PostgreSQL migration `1257_plain_text_receipt_canonical.sql` and Azure SQL migration `024_plain_text_receipt_canonical.sql` make HTML nullable, add the renderer version, and require at least one printable representation during compatibility.
- Sync includes `render_version`. New rows carry a null HTML field, while legacy HTML remains readable and sync-compatible until old rows are retired under a later approved migration.
- New `fiscal_data` rows use an explicit versioned snapshot containing only fiscal identity and verification fields required by receipt reads. Transaction lines, customer data, totals, and the full fiscal response are no longer copied into the receipt JSON snapshot.
- New `branding_snapshot` rows use an explicit allowlisted schema. Receipt reads prefer the immutable snapshot and fall back to current station branding only for legacy rows without one.
- Existing auto-print behavior now reuses an existing immutable receipt instead of regenerating content from mutable transaction state.

#### Tests

- [x] Legacy embedded receipt and report jobs remain readable during the drain period.
- [x] New reference payloads stay below 512 bytes in the representative regression fixture.
- [x] Station-scoped receipt/report lookup and exact receipt-ID selection are present in the persistence contract.
- [x] Source guards prevent new transaction receipt writers from embedding receipt bodies.
- [x] Migration guards protect processing jobs, specialized receipt sources, and rows without a matching canonical source.
- [x] Legacy receipt with stored HTML displays unchanged after Phase 2B read consolidation.
- [x] New receipt with only plain text displays generated HTML after Phase 2B.
- [ ] Add a database-backed restart/retry integration test in the authenticated full-suite environment.
- [ ] Add an explicit cross-station negative integration test in the authenticated full-suite environment.

#### Exit criteria

- [x] New reference-backed transaction/report print rows contain source references and small routing options only.
- [x] Reprint selection is deterministic when the immutable receipt ID is supplied.
- [x] New receipts do not require stored HTML.

### Phase 3 — Fiscal attempt canonicalization

#### Phase 3A implementation status

Implemented on 2026-07-21:

- `fiscalization_events` is the authoritative store for all new direct and proxy attempts.
- Proxy attempts use one lifecycle row: `PENDING` submission followed by `SUCCESS` or `FAILED` finalization.
- New transaction writes persist only a bounded, versioned event pointer/summary in `fiscalization_response`.
- `transactions.latest_fiscal_event_id` identifies the current attempt without copying its payload.
- Request/response payloads are sanitized before persistence and receive a SHA-256 payload hash.
- Receipt generation, receipt APIs, and proxy reconciliation read the event first.
- An in-process fallback counter records reads from legacy full transaction responses and is exposed as `legacyFiscalizationFallbackReads` in the proxy worker heartbeat metrics.
- PostgreSQL migration `1258_fiscalization_event_canonical.sql` and Azure SQL migration `025_fiscalization_event_canonical.sql` add the lifecycle metadata and indexes.

Compatibility remains intentionally non-destructive: legacy imported full responses are not rewritten or backfilled in this pass, and the transaction compatibility column remains in sync until deployment evidence shows zero fallback reads.

#### Phase 3B implementation status

Implemented on 2026-07-21:

- Added `npm run fiscal:backfill-events` with dry-run as the default and explicit `--apply`, station scope, all-station scope, batch-size, and maximum-batch controls.
- Backfill candidates are claimed in bounded `FOR UPDATE ... SKIP LOCKED` batches under a station advisory lock.
- Equivalent events are detected by station, transaction, payload hash, and normalized payload equality before any insert.
- Backfilled events use deterministic idempotency based on transaction ID and payload hash and are marked with `origin = backfill` and `transport = legacy`.
- Valid compatibility-summary/event-pointer pairs are excluded from candidate scans so completed rows cannot starve later legacy rows.
- Missing or stale `latest_fiscal_event_id` pointers are repaired in bounded batches before payload migration.
- Applying the backfill writes or reuses the canonical event, then atomically compacts the transaction response to the normal versioned event summary.
- The active setup importer and standalone legacy import script now persist canonical fiscal events and compact summaries instead of introducing new full transaction-column responses.
- Added a guarded `events-only` sync mode. It removes only `transactions.fiscalization_response`, requires local and Azure readiness checks, requires zero process-local legacy fallback reads, and requires explicit `VPOS_FISCALIZATION_SYNC_CUTOVER_ACK=true`.
- PostgreSQL migration `1259_legacy_fiscal_event_backfill.sql` and Azure SQL migration `026_legacy_fiscal_event_backfill.sql` add event-hash lookup support and the local candidate index.

The code path is ready, but compatibility remains the runtime default. Production still must execute dry-run/apply, verify the reported counts, deploy all current writers/readers, and complete a release soak with zero fallback reads before enabling events-only sync. No column drop is included.

#### Target model

`fiscalization_events` owns each fiscal attempt:

- engine/transport;
- request payload or a compliance-approved redacted request;
- response payload;
- status;
- reference;
- error summary;
- timestamps;
- optional payload hash/version.

`transactions` owns only current business state:

- status;
- fiscalization reference;
- fiscalized timestamp;
- retry counters and last compact error;
- optional latest fiscal event ID.

`receipts` owns a minimal immutable receipt snapshot, not the entire transport response.

#### Required sequence

1. **Normalize event writes**
   - [x] Ensure every current direct and proxy transaction fiscal path creates or finalizes a `fiscalization_events` row.
   - [x] Store an explicit engine/transport and payload schema version.
   - [x] Sanitize secrets before persistence.
   - [x] Add an index for latest event by `(station_id, transaction_id, occurred_at DESC, created_at DESC)`.

2. **Move readers**
   - [x] Receipt generation reads the latest successful event first.
   - [x] Receipt APIs read the stored receipt snapshot or latest successful event.
   - [x] Proxy reconciliation reads and updates an event-backed proxy attempt.
   - [ ] Admin and support views use event history.
   - [x] Legacy imported transactions retain fallback reading.

3. **Stop duplicate writes**
   - [x] Stop writing full bodies to `transactions.fiscalization_response` for current direct and proxy runtime paths.
   - [x] During compatibility, write only a compact typed event summary.
   - [ ] Stop syncing the transaction compatibility field after backfill and a release soak with zero fallback reads. The guarded events-only mode is implemented but not enabled by default.
   - [x] Add an in-process counter for fallback reads from the old column.

4. **Migrate existing rows**
   - [x] Implement a dry-run-first backfill that creates an event only where no equivalent event exists.
   - [x] Use deterministic idempotency based on transaction ID and normalized payload hash.
   - [x] Prevent duplicate success events through hash/payload equivalence checks and unique idempotency.
   - [x] Mark migrated events with legacy transport and backfill origin.
   - [x] Repair missing or stale latest-event pointers without rewriting valid canonical rows.
   - [ ] Execute the backfill against each deployed station and retain the reviewed metrics as release evidence.

5. **Destructive cleanup**
   - [ ] After at least one release with zero fallback reads, drop or replace `transactions.fiscalization_response`.
   - [ ] Coordinate PostgreSQL, active Azure SQL, sync specifications, importers, and rollback scripts.

#### Fiscal event retention

- Retain successful events according to legal/site policy.
- Bound failed attempts independently, preserving the latest failures needed for support and unresolved retries.
- Where full raw payload retention is not legally required, store a typed result plus hash and selected diagnostics.
- Never purge an event that is the only source for an existing legal receipt.

#### Exit criteria

- Each fiscal attempt has one authoritative event record.
- No current code path needs the transaction’s full response text.
- Sync no longer transfers the same full response twice.
- Legacy imports and rollback remain supported.

### Phase 4 — Forecourt/DOMS payload lifecycle

#### Target lifecycle

1. Receive raw controller message.
2. Persist the minimum durable recovery payload.
3. Normalize identifiers, transaction header, lines, tank/nozzle/pump data, and unattended fields.
4. Reconcile and record completion.
5. Clear or delete temporary raw payloads.
6. Retain bounded diagnostic events only.

#### Actions

- [x] Define explicit normalized, reconciled, controller-cleared, and payload-cleared lifecycle markers.
- [x] Require a normalized transaction and at least one durable `transaction_lines` row before clearing `doms_payload_json`.
- [x] Require no active, foreign-owned, or errored checkpoint/replay claim before clearing raw payload.
- [x] Separate temporary payload ownership by lifecycle: `forecourt_transactions.raw` owns ingestion evidence until promotion, the JPL checkpoint owns controller-clear recovery data, supervised replay rows are metadata-only, and normalized transactions do not permanently retain the same body.
- [x] Compact promoted `forecourt_transactions.raw` after the recovery window while retaining compact identifiers and lifecycle metadata.
- [x] Classify `forecourt_events` by retention class: routine, error, maintenance/security, and field evidence.
- [x] Replace `tanks.last_tg_payload` with compact diagnostic metadata or rely on bounded recent events.
- [x] Null terminal replay/checkpoint payloads after successful clear, preserve compact outcome/lifecycle metadata, and delete cleared terminal rows only after independent retention windows and canonical transaction proof.
- [ ] Keep `forecourt_state` as the latest current snapshot only. Do not treat it as historical audit.
- [x] Remove duplicate unattended JSON once its typed fields/owner are finalized; avoid mirroring the same structure on both forecourt and business transaction rows.
- [x] Ensure support bundle/admin diagnostics tolerate cleared payloads and report present, cleared, unlinked, waiting-for-lines, and active-recovery states.

#### Phase 4A implementation boundary

Migration `1260_forecourt_payload_lifecycle.sql` adds explicit ownership and clear markers to normalized transactions, raw forecourt transactions, JPL transaction checkpoints, and supervised replay rows. The central retention worker performs bounded, station-scoped, `SKIP LOCKED` compaction and is disabled and dry-run by default. Both `VPOS_RETENTION_ENABLED=true` and `VPOS_FORECOURT_PAYLOAD_COMPACTION_ENABLED=true` are required before it runs.

Compaction is ordered: the normalized transaction payload clears only after persisted lines, reconciliation, controller clear, no open recovery claim, and the configured grace period. Raw forecourt and checkpoint/replay payloads clear only after the normalized transaction clear marker exists. Rows, identifiers, hashes, timestamps, outcomes, and clear reasons remain available for support. New payload capture resets prior clear markers. No production compaction is executed by this repository pass.

Validation for the repository pass: 40 focused compatibility regressions passed, 13 changed TypeScript entrypoints bundled, the page-boundary check remained at zero violations, and repository JSON/Markdown integrity checks passed. The full authenticated production build remains a deployment-pipeline requirement.

#### Phase 4B implementation boundary

Migration `1261_forecourt_event_tank_retention.sql` adds forecourt event retention classes, payload hashes, bounded-payload metadata, compact tank-gauge diagnostics, and indexed legacy payload candidates. New event writes are classified and redacted before persistence while current-state materialization continues to use the original in-memory message. Routine, error, maintenance/security, and field-evidence rows have independent retention periods and remain governed by the existing disabled-by-default, dry-run-first retention worker.

New tank-gauge writes persist normalized values, a compact diagnostic envelope, and a source hash; they no longer retain the full source response. Existing raw tank payloads are backfilled to compact diagnostics and become eligible for bounded compaction only after the recovery grace period. New normalized transaction writes no longer mirror unattended receipt/payment JSON. Legacy transaction and raw-forecourt unattended JSON clears only after normalization, reconciliation, durable transaction lines, controller clear, and the same recovery-safety checks introduced in Phase 4A.

This pass does not execute production retention, delete terminal checkpoint/replay rows, drop compatibility columns, or shorten field-evidence retention below the configured operational default. Site compliance approval remains required before changing retention periods.

Validation for Phase 4B: the 11 reported TypeScript errors were corrected and the affected files pass focused TypeScript compilation; 55 focused archive, retention, receipt, print, fiscal-event, forecourt lifecycle, event-classification, and tank-diagnostic regressions pass; 17 changed TypeScript entrypoints bundle successfully; the page-boundary architecture check reports zero violations; and repository JSON/Markdown integrity checks pass. The full authenticated production typecheck/build remains a deployment-pipeline requirement because private Gilbarco packages are unavailable in the analysis environment.

#### Phase 4C implementation boundary

Migration `1262_jpl_checkpoint_replay_retention.sql` makes `forecourt_jpl_transaction_checkpoints` the sole temporary JPL recovery-payload owner. Existing supervised replay payloads are copied into a matching checkpoint without overwriting newer checkpoint data; replay reads remain compatible through a checkpoint-first join. New supervised transaction capture persists the checkpoint before replay metadata, and live clear now marks both workflow rows terminal.

The payload compactor clears legacy replay payload columns only after the corresponding checkpoint contains every required payload component. General station retention then deletes cleared replay metadata after 14 days and cleared checkpoint metadata after 30 days by default. Both targets require terminal success, no errors or foreign lock, cleared payload columns, a linked canonical transaction, controller-clear completion, and a durable normalized-payload clear marker. Active, failed, blocked, unresolved, or payload-bearing rows are never eligible.

The migration itself does not delete rows or clear payloads. Retention remains disabled and dry-run by default. Site operators must review payload-consolidation and terminal-row metrics before enabling deletion.

Validation for Phase 4C: 29 focused archive, retention, forecourt lifecycle, event, tank, and JPL ownership tests pass; 70/70 executable receipt, print, fiscal-event, archive, retention, replay, and lifecycle compatibility checks pass; the separate unattended-transaction suite remains excluded because it requires the unavailable private DOMS package; 10 changed TypeScript entrypoints bundle successfully; the page-boundary architecture check reports zero violations; and repository metadata was regenerated for 1,636 files, 4,402 symbols, 5,668 import edges, 290 API routes, and 42 pages.

#### Safety tests

- Crash between raw persistence and normalization recovers.
- Crash after normalization but before raw clearing is idempotent.
- Clearing never occurs when transaction lines are missing.
- Supervised replay cannot reference a cleared payload unless a durable source remains.
- Support/admin screens distinguish “cleared by policy” from “never captured.”
- Active pump/transaction workflows are unaffected by retention.

#### Exit criteria

- A completed forecourt transaction does not retain three full raw copies.
- Recovery remains durable and testable.
- Forecourt event growth is bounded.

### Phase 5 — Configuration, KV, and PSS XML cleanup

#### 5A. Configuration ownership

Keep these boundaries explicit:

- `station_settings`: typed station business/runtime settings.
- `station_config`: current application/process/integration configuration.
- `plugin_configs`: current plugin-specific configuration.
- `device_configs`: current physical/logical device configuration.
- `station_kv`: small operational state, bootstrap markers, approved environment overrides, leases/checklists, and integration metadata that has no typed owner.

Rules:

- [x] Do not introduce new typed business settings in `station_kv`; new writes pass an explicit owner registry or bounded compatibility mode.
- [x] Do not copy the same setting between `station_settings`, `station_config`, and KV; ownership is documented in `CONFIGURATION_OWNERSHIP.md`.
- [x] Document and implement environment precedence: non-empty `process.env`, then `env:*` KV, then code default.
- [x] Validate registered KV values with key-specific schemas.
- [x] Add application and database maximum value sizes and reject accidental large blobs.

#### Phase 5A implementation boundary

Migration `1263_configuration_ownership_guardrails.sql` is non-destructive. It removes all current application writes to `station_settings.key`, makes that column nullable, removes its legacy uniqueness/index requirement, and adds `NOT VALID` database guardrails for station KV key shape and maximum payload size. The application policy classifies exact keys/prefixes, applies key-specific value schemas, caps unregistered compatibility values at 16 KiB, and supports an opt-in strict mode.

Normal setup and proxy writers now use the canonical KV boundary. Process environment values consistently override persisted `env:*` fallbacks. The legacy bare `JPL_REQUEST_DISPATCH_POLICY` key remains read-compatible while new values use `env:JPL_REQUEST_DISPATCH_POLICY`.

`npm run config:storage:audit` provides the required site-database preflight for `station_kv.value_json`, `station_settings.key`, `station_settings.value_json`, and `job_queue`. It reports meaningful rows, queue status counts, oversized/unregistered KV values, and matching views, materialized views, functions, and triggers. No candidate is dropped, no legacy value is cleared, and strict mode remains disabled by default until deployment inventories are clean.

#### 5B. Remove unused columns/tables

After database-level checks:

- [x] Add an explicit, same-transaction retirement command for `station_kv.value_json`, legacy station settings columns, and `job_queue`.
- [x] Require empty values/rows, zero database dependencies, maintenance confirmation, operator identity, and an external backup reference.
- [x] Add post-action verification and an auditable compatibility-shell restore.
- [ ] Execute the retirement command independently at each deployment after external SQL, BI, and older-binary review.
- [ ] Replace the historical schema baseline only after every supported deployment has completed retirement.

#### Phase 5D deployment-safe retirement boundary

Migration `1266_legacy_config_storage_retirement_support.sql` creates only `config_storage_retirement_runs`, an operator audit ledger. It contains no retired business payloads and performs no `DROP` statement during normal startup migration processing.

`npm run config:storage:retire` defaults to a read-only plan. Applying the retirement requires `--maintenance-confirmed`, an external `--backup-reference`, `--operator`, and the exact `DROP_LEGACY_CONFIG_STORAGE` acknowledgement. The command takes a transaction advisory lock, reruns the full storage audit in that transaction, records the pre-action state, drops with `RESTRICT` semantics, reruns the audit, and commits only when all four candidates are absent.

The audit was hardened so populated `station_settings.key` rows are blockers and so it continues to operate after the columns/table have been removed. `npm run config:storage:audit -- --require-retired` provides the post-deployment assertion.

A separate compatibility-shell restore recreates nullable columns and an empty generic queue. It does not restore historical values or jobs; full rollback and older-binary recovery require the external database backup. The operational procedure is documented in `CONFIGURATION_STORAGE_RETIREMENT.md`.

Validation for Phase 5D: the exact repository TypeScript command passes; 16 focused retirement/KV tests pass; 273 executable regression tests pass across 70 files; 16 private DOMS/JPL-dependent files remain authenticated-registry checks; four changed operational entrypoints bundle successfully; architecture validation reports zero violations; and repository JSON/Markdown integrity checks pass.

#### 5C. Version history

- [x] Keep latest 20 station config versions per station.
- [x] Keep latest 20 plugin config versions per plugin/station.
- [x] Keep latest 20 device config versions per device/station.
- [x] Preserve versions explicitly tagged/pinned for deployment or rollback.
- [x] Avoid inserting a new version when the normalized configuration hash is unchanged.

#### 5D. PSS XML

Canonical split:

- Raw XML: authoritative import/export source.
- ID map: required to translate normalized IDs back to PSS IDs.
- Normalized tables/config: queryable runtime model.
- Checksum/timestamps/error/summary: compact operational metadata.
- Parsed JSON: removable duplicate.

Actions:

- [x] Replace admin status reads of `PSS_XML_KEYS.PARSED_JSON` with a compact import summary.
- [x] Stop writing parsed JSON.
- [x] Add dry-run-first removal of existing parsed JSON KV values after a compatibility release.
- [x] Keep raw XML while export remains supported.
- [x] Enforce an explicit 8 MiB application/database ceiling for raw XML.
- [ ] Define a compression/encryption policy if measured site files justify it.
- [x] Do not move raw XML to an unmanaged filesystem path without designed backup, permissions, atomic writes, and multi-instance access.

#### Phase 5C implementation boundary

Migration `1265_pss_summary_config_version_retention.sql` is non-destructive. It adds normalized configuration hashes, pin metadata, and retention indexes to the station, plugin, and device version tables. It also backfills `pss.xml.importSummary` from legacy parsed data where possible, but it does not prune versions or remove parsed PSS rows.

Configuration writers now suppress unchanged normalized snapshots using deterministic SHA-256 hashes. The station-scoped retention coordinator keeps the latest 20 versions per owner by default, excludes explicitly pinned rollback/deployment rows, requires a seven-day minimum age for excess rows, and uses bounded `SKIP LOCKED` batches. Operators can pin or unpin versions with `npm run config:versions:pin`.

New PSS imports persist raw XML, the export ID map, normalized runtime data, and a compact versioned import summary. They no longer persist the full parsed object. Admin status reads the summary first and uses the legacy parsed object only to derive temporary compatibility metadata. The parsed-row retention target requires raw XML, ID map, summary, and a 30-day compatibility window measured from summary creation/update. Retention remains globally disabled and dry-run by default; no production cleanup was executed in this pass.

The complete rollout and rollback contract is documented in `CONFIGURATION_HISTORY_AND_PSS_STORAGE.md`. Raw XML compression/encryption policy remains open because site file sizes and deployment key management must be measured before choosing a storage transformation.

#### Exit criteria

- Each configuration value has one current owner.
- Version tables are bounded.
- PSS XML no longer stores a full parsed copy.

### Phase 6 — Country catalog consolidation

#### Decision

Make `country_datasets` and `country_dataset_rows` the canonical database source.

Reasons:

- rows are explicitly scoped by country and dataset type;
- the admin country dataset APIs already read and write them;
- bundled TypeScript datasets already bootstrap them;
- `cfg_*` copies create a second mutable representation and can drift;
- global `cfg_*` tables are less suitable for multiple active country catalogs.

#### Actions

- [x] Create typed query adapters over `country_dataset_rows` for the six active catalog groups: tax types, product classes/types, credit-note reasons, packaging units, and quantity units.
- [x] Migrate active runtime readers from `cfg_*` to the country-scoped adapters.
- [x] Add country-scoped compatibility views and a legacy-to-canonical mapping for older SQL consumers and rollback planning.
- [x] Stop the seeding step that copies dataset rows into `cfg_*`.
- [x] Verify through source guards and runtime tests that admin-managed canonical rows are the values read by the application.
- [ ] Drop `cfg_*` tables only after every deployed country passes `country:catalog:audit`, external consumers migrate, and rollback is proven.
- [x] Retain bundled files as immutable seed/versioned defaults, not a runtime authority after database bootstrap.
- [x] Add deterministic dataset hashes and an explicit `reset-to-bundled-defaults` operation rather than silently overwriting admin edits.

#### Exit criteria

- An active catalog code exists in one mutable database row.
- Runtime and admin read the same source.
- Country-specific data cannot leak across station/country context.

### Phase 7 — Destructive cleanup and cloud/sync coordination

Destructive migrations occur only after feature rollout, fallback telemetry, and soak.

Candidate removals:

- `transactions.fiscalization_response`;
- `receipts.html_content` eventually, or retain nullable indefinitely for legacy history;
- `station_kv.value_json`;
- legacy `station_settings.key` and `station_settings.value_json`;
- `job_queue`;
- parsed PSS XML KV entries;
- duplicate country `cfg_*` tables;
- deprecated archive export tables;
- obsolete raw forecourt columns after lifecycle migration.

For every candidate:

- [ ] Search current source.
- [ ] Search generated SQL, migrations, views, functions, triggers, and reports.
- [ ] Check PostgreSQL and active Azure SQL.
- [ ] Check sync table specs and serialization.
- [ ] Check legacy import/export.
- [ ] Check support bundle and admin pages.
- [ ] Check site-specific scripts and previous app versions.
- [ ] Run a no-reader/no-writer soak with metrics.
- [ ] Create forward and rollback migrations.
- [ ] Document data that cannot be reconstructed.
- [ ] Take and verify a backup before production execution.

## 9. Planned migration groups

Use the next available migration numbers; do not assume these examples are free.

| Group                      | Purpose                                                    | PostgreSQL | Azure SQL                                           |
| -------------------------- | ---------------------------------------------------------- | ---------- | --------------------------------------------------- |
| Retention indexes/state    | Efficient terminal cleanup and resolution markers          | Required   | Only for mirrored queue/inbox tables                |
| Receipt HTML compatibility | Make HTML nullable; optional render version                | Required   | Required if receipts are mirrored                   |
| Fiscal event enhancement   | Event schema version/hash/latest-event reference as needed | Required   | Required if fiscal events/transactions are mirrored |
| Forecourt lifecycle        | Normalized/reconciled/payload-cleared markers              | Required   | Only if those tables are mirrored                   |
| Config cleanup             | Drop unused KV/settings columns and generic jobs           | Required   | Match only existing mirrored schema                 |
| Catalog consolidation      | Compatibility views/read migration/drop `cfg_*`            | Required   | Based on actual cloud catalog usage                 |
| Archive retirement         | Drop deprecated export tables/compact archive              | Required   | Based on actual mirror usage                        |

Avoid creating schema merely to represent data already available through existing source reference columns.

## 10. Code touch map

### Fiscalization and receipts

- `src/modules/transactions/infrastructure/fiscalization/transaction-fiscalization.repository.ts`
- `src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts`
- `src/shared/fiscalization/receipt/receiptBuilder.ts`
- `src/modules/transactions/infrastructure/persistence/*`
- `app/api/receipts/route.ts`
- `app/api/receipts/print/route.ts`
- `src/modules/sync/infrastructure/syncTableSpecs.ts`
- local/cloud sync repositories
- legacy transaction importer

### Printing and reports

- `src/modules/printing/infrastructure/printJobs.ts`
- `src/modules/printing/infrastructure/printJobsRepo.ts`
- shared print queue helpers
- transaction completion auto-print writer
- report generation/queue writers

### Archive and retention

- `src/modules/runtime/infrastructure/busListeners.ts`
- `src/modules/archive/infrastructure/archiveEventsRepo.ts`
- `src/modules/archive/infrastructure/archiveExports.ts`
- queue/inbox repositories
- `src/platform/security/audit/cleanup.ts`
- `src/platform/logs/retention.ts`
- startup/composition root or deployment scheduler

### Forecourt/DOMS

- forecourt persistence repository;
- JPL transaction upsert and recovery repositories;
- supervised replay/checkpoint repositories;
- tank persistence;
- support bundle;
- admin forecourt event/status APIs.

### Configuration and datasets

- station KV helpers;
- typed station settings repositories;
- station/plugin/device config version writers;
- PSS XML importer/exporter/status;
- country dataset bootstrap/readers;
- runtime `cfg_*` readers.

## 11. Automated test requirements

### Ownership and compatibility

- No new write stores a full fiscal result in both transaction and event.
- No new print job embeds a receipt/report body.
- Receipt HTML generation is deterministic for a render version.
- New PSS imports do not write parsed JSON.
- Runtime catalog reads use the same canonical rows edited by admin.
- Deprecated columns receive no writes during soak.

### Retention

- Only eligible terminal states are deleted.
- Boundary timestamps are deterministic.
- Cleanup uses batches and can resume after interruption.
- Concurrent cleanup workers do not overlap.
- Unresolved dead/manual-review records survive.
- Successful fiscal evidence is protected.
- Foreign-key cleanup order is valid.

### Forecourt recovery

- Raw persistence precedes clearing.
- Normalization is idempotent.
- Payload clearing requires all completion predicates.
- Restart and reconnect recovery work after compaction.
- Cleared payloads do not break support/admin views.

### Sync/cloud

- PostgreSQL-only cleanup does not reference missing Azure tables.
- Synced rows remain serializable during mixed-schema compatibility.
- Removed columns are removed from sync specs only after all readers migrate.
- Legacy cloud rows can still be ingested during the compatibility window.

## 12. Storage measurement

Run against a representative copy before and after each phase.

```sql
SELECT
  schemaname,
  relname,
  n_live_tup,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

```sql
SELECT
  pg_size_pretty(pg_total_relation_size('print_jobs')) AS print_jobs,
  pg_size_pretty(pg_total_relation_size('transactions')) AS transactions,
  pg_size_pretty(pg_total_relation_size('fiscalization_events')) AS fiscalization_events,
  pg_size_pretty(pg_total_relation_size('receipts')) AS receipts,
  pg_size_pretty(pg_total_relation_size('forecourt_events')) AS forecourt_events,
  pg_size_pretty(pg_total_relation_size('archive_events')) AS archive_events;
```

```sql
SELECT
  avg(pg_column_size(payload)) AS avg_payload_bytes,
  max(pg_column_size(payload)) AS max_payload_bytes
FROM print_jobs;
```

```sql
SELECT
  avg(pg_column_size(fiscalization_response)) AS avg_response_bytes,
  max(pg_column_size(fiscalization_response)) AS max_response_bytes
FROM transactions
WHERE fiscalization_response IS NOT NULL;
```

```sql
SELECT
  topic,
  message_type,
  count(*) AS rows,
  sum(pg_column_size(message_json)) AS payload_bytes
FROM archive_events
GROUP BY topic, message_type
ORDER BY payload_bytes DESC;
```

```sql
SELECT
  status,
  count(*) AS rows,
  min(created_at) AS oldest,
  max(created_at) AS newest
FROM print_jobs
GROUP BY status
ORDER BY status;
```

Record daily deltas for at least seven normal operating days. A one-time table size snapshot is insufficient to identify the fastest-growing writer.

## 13. Rollout

1. Measure and add telemetry.
2. Stop unbounded archive writes.
3. Add retention jobs without deleting data; log candidates in dry-run mode.
4. Enable bounded queue cleanup.
5. Deploy reference-based print writes with legacy read compatibility.
6. Deploy nullable/generated receipt HTML.
7. Move fiscal readers to events and measure legacy fallback.
8. Dry-run and apply the idempotent legacy fiscal-response backfill; repair event pointers.
9. After local/cloud readiness and a zero-fallback release soak, enable guarded events-only sync.
10. Add forecourt lifecycle markers and payload clearing.
11. Remove parsed PSS JSON and bound configuration versions.
12. Migrate country catalog readers.
13. Soak for at least one normal release cycle.
14. Execute destructive migrations with verified backup and rollback.

Recommended feature controls:

```env
VPOS_RETENTION_ENABLED=false
VPOS_RETENTION_DRY_RUN=true
VPOS_FISCALIZATION_SYNC_MODE=compatibility
VPOS_FISCALIZATION_SYNC_CUTOVER_ACK=false
VPOS_FORECOURT_PAYLOAD_COMPACTION_ENABLED=false
VPOS_FORECOURT_PAYLOAD_COMPACTION_DRY_RUN=true
VPOS_FORECOURT_PAYLOAD_GRACE_DAYS=7
VPOS_COUNTRY_DATASET_CANONICAL_READ=false
VPOS_RUNTIME_ARCHIVE_MODE=off
```

Feature flags are migration controls, not permanent alternate storage models. Remove them after the compatibility window.

## 14. Risks and controls

| Risk                                     | Control                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Legal receipt/fiscal evidence removed    | Compliance sign-off; protect successful event linked to receipt.                           |
| Proxy reconciliation breaks              | Migrate proxy reads/writes before transaction response removal.                            |
| Reprints change after renderer updates   | Persist render version and immutable minimal snapshots.                                    |
| Print source deleted before retry        | Source retention exceeds print retry/failed retention.                                     |
| DOMS recovery loses raw payload          | Clear only after durable normalized state and explicit lifecycle markers.                  |
| Failed work disappears                   | Separate failed/dead retention and require resolution marker.                              |
| Admin catalog and runtime diverge        | One canonical dataset adapter and integration test.                                        |
| Older app writes removed column          | Single-version rollout and expand/contract migrations.                                     |
| Azure schema drift                       | Explicit mirror inventory and cloud compatibility tests.                                   |
| Retention causes large locks             | Indexed predicates, small batches, advisory lock, timeout.                                 |
| Sensitive payload remains in diagnostics | Typed allowlist, redaction, size limits, bounded retention.                                |
| Generated field evidence is lost         | Store approved evidence in a controlled external location and retain its reference/digest. |

## 15. Progress tracker

### Verified planning

- [x] Trace fiscal duplicate writers/readers.
- [x] Trace print payload duplication.
- [x] Confirm receipt HTML is derived.
- [x] Trace forecourt raw payload fan-out.
- [x] Trace queue terminal-state behavior.
- [x] Confirm unused `station_kv.value_json`.
- [x] Confirm no runtime `job_queue` reference.
- [x] Trace PSS raw/parsed/ID-map usage.
- [x] Trace country dataset duplication.
- [x] Confirm archive wildcard writer and deprecated exports.
- [x] Review documentation duplication.

### Implementation

- [ ] Phase 0 baseline and compliance approval.
- [x] Phase 1A/1B archive and queue/log retention controls implemented behind safe rollout flags; production soak and archive-export retirement remain open.
- [x] Phase 1C/5D generic `job_queue` retirement command, same-transaction audit, and compatibility restore implemented; per-site execution remains maintenance-window controlled.
- [x] Phase 2A reference-based transaction/report print jobs with dual-read legacy compatibility.
- [x] Phase 2B receipt HTML-on-read consolidation.
- [x] Phase 3A/3B fiscal event canonicalization, legacy backfill tooling, importer closure, and guarded sync cutover implemented; production backfill/soak and destructive cleanup remain open.
- [x] Phase 4 forecourt lifecycle Phases 4A–4C implemented behind dry-run-first retention controls; production enablement remains site-controlled.
- [x] Phase 5A–5D configuration ownership, bounded history, compact PSS summaries, parsed-copy retirement, and explicit generic-storage retirement tooling implemented; production retention and per-site retirement execution remain open.
- [x] Phase 6 country catalog canonicalization implemented non-destructively in Phase 5B; per-deployment audit, external-consumer migration, release soak, and `cfg_*` drops remain open.
- [ ] Phase 7 destructive cleanup.

## 16. Documentation governance

Documentation should describe durable architecture, operation, or current work—not every implementation pass.

Rules:

- Use `docs/INDEX.md` as the authoritative map.
- Append completed refactor work to `docs/REFACTOR_PASS_HISTORY.md`.
- Append completed DOMS implementation work to `docs/DOMS_INTEGRATION_HISTORY.md`.
- Do not add new `*_PASS.md` files for work already captured in those histories.
- Keep operational runbooks and release gates separate because they remain actionable.
- Do not commit generated simulator/live evidence or machine-specific reports.
- Store approved deployment evidence in the organization’s controlled evidence location and record its digest/reference in the application.
- Review the documentation index at each release; remove stale implementation summaries when code and durable docs supersede them.
- Git history is the archive for deleted pass notes.

### Repository cleanup completed with this revision

Removed because content is consolidated or non-authoritative:

- `docs/REFACTOR_PASS_2.md`
- `docs/REFACTOR_PASS_3.md`
- `docs/REFACTOR_PASS_4.md`
- `docs/FORECOURT_COMMISSIONING_PASS.md` (summary moved to DOMS history)
- `NEO_FUEL_2077_IMPLEMENTATION.md`
- `NEON_QUICK_REFERENCE.md`
- committed `doms-jpl-live-report.json`
- committed `doms-jpl-live-evidence.json`

Retained:

- `DOMS_INTEGRATION_TODO.md` and `DOMS_REMAINING_WORK.json`, because they are current and referenced;
- consolidated history documents;
- operational DOMS/Tanzania runbooks, validation gates, and commissioning material;
- architecture and startup documentation.

## 17. Definition of done

The program is complete when:

- canonical ownership is implemented and documented;
- new writes no longer create the identified duplicate full payloads;
- transient and diagnostic data has automated bounded retention;
- successful fiscal/receipt evidence remains compliant and reproducible;
- forecourt recovery is proven after payload compaction;
- configuration and country catalog reads have one owner;
- sync and active cloud schemas are compatible;
- no deprecated column/table receives reads or writes during the soak window;
- destructive migrations and rollback are tested on a production-like copy;
- storage growth is measurably lower over a representative operating period;
- the documentation index contains only current durable documents and consolidated histories.

## 18. Change log

### 2026-07-21 — Phase 5D deployment-safe legacy storage retirement

- Added non-destructive migration `1266_legacy_config_storage_retirement_support.sql` with an operator audit ledger.
- Hardened the storage audit so populated `station_settings.key` rows block removal and post-drop audits continue to work when columns/tables are absent.
- Added `npm run config:storage:retire` with read-only planning by default.
- Required maintenance confirmation, external backup reference, operator identity, and an exact acknowledgement before applying drops.
- Executed preflight and post-action audits under the same transaction advisory lock and used `RESTRICT` semantics for `job_queue`.
- Added `npm run config:storage:audit -- --require-retired` for post-deployment verification.
- Added a compatibility-shell restore that recreates nullable columns and an empty queue without claiming to restore historical data.
- Kept all destructive execution per-site and operator-controlled; no production database was modified in this pass.

### 2026-07-21 — Phase 5C configuration history and PSS parsed-copy retirement

- Stopped new PSS imports from persisting the full parsed XML object and added a compact versioned import summary.
- Kept raw XML, ID mapping, normalized runtime data, checksum, and import metadata as distinct durable owners.
- Added non-destructive migration `1265_pss_summary_config_version_retention.sql` to backfill summaries and prepare station/plugin/device version tables for hash-aware pinned retention.
- Added deterministic normalized configuration hashes and suppressed unchanged version writes.
- Added station-scoped count-based retention that keeps the latest 20 versions per owner, protects pinned rollback rows, and requires a minimum age before deleting excess history.
- Added `npm run config:versions:pin` and documented rollout/rollback behavior in `CONFIGURATION_HISTORY_AND_PSS_STORAGE.md`.
- Added dry-run-first removal of legacy `pss.xml.parsed` only when raw XML, ID map, compact summary, and the compatibility window are all present.
- Kept retention disabled by default and performed no production pruning or parsed-copy deletion.

### 2026-07-21 — Phase 5B country catalog canonicalization

- Made `country_datasets` and `country_dataset_rows` the sole mutable runtime/admin country catalog.
- Added typed, country-scoped catalog adapters and migrated the remaining fiscal and configuration readers away from global `cfg_*` tables.
- Removed the startup/admin seed-copy path that recreated a second mutable catalog representation.
- Added deterministic SHA-256 catalog hashes and an explicit `reset-to-bundled-defaults` operation.
- Added non-destructive migration `1264_country_catalog_canonical.sql` with country-scoped compatibility views and a legacy mapping view.
- Added `npm run country:catalog:audit` to verify country resolution, canonical completeness, content hashes, legacy row equivalence, compatibility views, and PostgreSQL dependencies.
- Kept all `cfg_*` table drops deployment-gated pending per-country audits, external consumer migration, backups, rollback testing, and release soak.

### 2026-07-21 — Phase 5A configuration ownership and retirement guardrails

- Added a central station KV ownership, validation, size-limit, and rollout policy.
- Routed active setup, proxy, bootstrap, forecourt, and Tanzania configuration writers through canonical typed or KV owners.
- Standardized environment precedence as process environment, persisted `env:*` override, then code default.
- Closed all active writes to legacy `station_settings.key`.
- Added non-destructive migration `1263_configuration_ownership_guardrails.sql`.
- Added `npm run config:storage:audit` to verify database rows and PostgreSQL dependencies before dropping `station_kv.value_json`, legacy station settings columns, or `job_queue`.
- Kept all destructive removals and strict KV enforcement deployment-gated.

### 2026-07-21 — Phase 2A reference-based print jobs

- Converted new transaction receipt and report jobs to compact source-reference payloads.
- Added station-scoped canonical receipt/report resolution with immutable receipt-ID selection.
- Preserved legacy embedded job execution and canonicalized legacy job-type aliases.
- Protected specialized embedded receipt formats such as credit notes from automatic canonical substitution or migration compaction.
- Added data migration `1256_reference_based_print_jobs.sql` and focused payload/migration regression tests.
- Removed the unused duplicate print SQL definition from the platform query folder.

### 2026-07-21 — Phase 1B queue and log retention implementation

- Added a single station-scoped retention coordinator for terminal queues, fiscal inbox, audit logs, expired sessions, and VPOS logs.
- Added dry-run-first feature controls and conservative per-store defaults.
- Protected pending, processing, retryable, unresolved dead-letter, and unlinked successful queue records.
- Added durable fiscal inbox resolution timestamps and exposed them through repository/API view models and fiscal inbox details UI.
- Added migration `1255_queue_and_log_retention.sql` with partial retention indexes.
- Routed legacy audit and log cleanup scripts through the same bounded implementation.

### 2026-07-21 — Repository verification revision

- Replaced assumptions with traced writers/readers.
- Elevated wildcard archive persistence to the first cleanup phase.
- Corrected archive retention because archive exports are deprecated.
- Corrected print migration to use existing source reference columns.
- Preserved proxy/legacy compatibility before fiscal response removal.
- Selected plain text as canonical receipt render content.
- Protected minimal immutable fiscal/branding snapshots.
- Selected `country_dataset_rows` as canonical country catalog storage.
- Kept raw PSS XML and targeted parsed JSON instead.
- Split successful versus failed/dead retention.
- Added Azure SQL and sync compatibility requirements.
- Added documentation consolidation and generated-evidence policy.
