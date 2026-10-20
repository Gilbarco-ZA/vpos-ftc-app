# Country fiscalization layer — integration checklist

Status: **Scaffold only / no production wiring**.

The country registry and contracts are added in isolation. Do not change the
current proxy sender, products service, config.xml importer, receipt builder,
station configuration, retry workers or API routes until a later integration PR.
Country *definitions* describe intended capabilities; they do not claim runtime
adapters have been implemented, connected, or tested.

## Foundation
- [x] Shared canonical product, invoice, tender and receipt model types
- [x] Adapter interface and explicit capability declarations
- [x] Strict country alias normalization and unsupported-country rejection
- [x] Registry with duplicate registration guard and unconnected-adapter failure
- [x] Kenya and Tanzania declarative country definitions
- [x] Scaffold regression tests for country resolution
- [x] Standalone Kenya/Tanzania product policy implementations (testing only)
- [x] Opt-in product policy registry and country-specific registration serializers
- [ ] Country-specific full fiscal adapter implementations with typed error handling
- [ ] Unit tests for all implemented adapter methods
- [ ] Definition/implementation capability consistency checks
- [ ] Confirm supported country configuration versus bundled dataset availability

## Product catalog and registration
- [ ] Resolve class code, type code, tax code, currency, units, packaging and hazardous flag
- [x] Validate Kenya types 1 / 2 / 3 and accepted aliases in isolated policy
- [x] Validate Kenya tax codes A / B / C / D / E in isolated policy
- [x] Avoid guessing classification for unknown Kenya fuel grade in standalone policy
- [ ] Make Kenya fuel-grade defaults configurable and review diesel classification with tax catalog
- [ ] Preserve configured overrides on XML reimport
- [x] Tanzania single-product registration serializer scaffold
- [ ] Tanzania product upload and status lookup integration parity
- [x] Kenya products[] batch serialization unit test (production parity still pending)
- [ ] Map API validation errors to actionable product statuses
- [ ] Confirm batch limits, partial failures, idempotent product registration

## Invoice, credit notes and payments
- [ ] Canonical transaction-to-invoice mapping, multi-line fuel/nonfuel parity
- [x] Standalone Kenya DocumentId / Lines / Currency / Payment.Tenders serializer (testing only)
- [ ] Verify Kenya serializer parity against current proxy payloads
- [x] Payment method 01-07 normalization and mixed tender sum validation in standalone policy
- [ ] Verify rounding and split tender behavior against live proxy contracts
- [x] Initial Tanzania envelope/timestamp builder with required enrichment guard (testing only)
- [ ] Tanzania full metadata, tax and totals parity with existing runtime implementation
- [ ] Tax rates, exemptions, discounts and inclusive/exclusive prices
- [ ] Buyer TIN/PIN and country-specific mandatory fields
- [ ] Credit-note reference, reason and reversing amounts
- [ ] Snapshot tests against each country's current proxy contract

## API, status, workers and recovery
- [ ] Confirm and register current proxy endpoints from authoritative swagger
- [ ] Keep HTTP transport, auth, timeouts, retries and idempotency keys shared
- [ ] Map country-specific response/status codes into canonical states
- [ ] Correlate pending documents by stable transaction/document IDs
- [ ] Status check before replay of uncertain fiscalization outcome
- [ ] Handle fiscalized, pending, rejected, not-found, transport timeout responses
- [ ] Protect concurrent retry workers from duplicate submission
- [ ] Preserve status, audit history and receipts through worker restarts
- [ ] Explicit feature-not-supported behavior, never implicit fallback

## Receipts, inventory and regulatory reporting
- [ ] Bind existing KE and TZ receipt templates to canonical receipt contract
- [ ] Preserve verification QR/signature, PIN/TIN, counters and print order
- [ ] Tanzania TRA counters, daily totals and E W U R A integration
- [ ] Tanzania tank reconciliation, ATG downtime and sites without ATG
- [ ] Determine supported Kenya reporting/tank capabilities from proxy swagger
- [ ] Stock-in/out and product synchronization where applicable

## Integration rollout — later PRs only
- [ ] Products: adapter behind opt-in test harness, compare payloads
- [ ] PSS XML: country defaults policy injection, no output behavior change
- [ ] Invoices: new adapter compared against existing live mapper
- [ ] Receipts: new adapter compared with existing print/preview output
- [ ] Status/recovery: shadow comparison; prevent side-effecting duplicate calls
- [ ] Add station-level opt-in/rollback switch before production activation
- [ ] Test Kenya/Tanzania separately, including negative/error cases
- [ ] Run lint, TypeScript, contract tests and full regression suite
- [ ] Confirm no changes to existing execution paths before activation
- [ ] Enable one site at a time with rollback plan and operational observability

## Current integration boundaries to revisit

- `src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload.ts`
- `src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts`
- `src/modules/products/application/services/product-service.ts`
- `src/modules/setup/infrastructure/pssXmlImporter.ts`
- `src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts`
- `src/shared/config/datasets/registry.ts`

These locations are **references only**: none are modified by the scaffold PR.

## Fiscal-layer testing pass: product policies

- [x] Kenya product validation, aliases and products[] batch builder isolated from live services.
- [x] Tanzania product classification validation and per-product registration mapper scaffold.
- [x] Opt-in resolver `getCountryProductPolicy()`; existing runtime remains unchanged.
- [x] Initial unit tests for Kenya registration and Tanzania single-product serialization.
- [ ] Compare Tanzania mapper outputs with real existing proxy requests before activating it.
- [ ] Verify actual Kenya Diesel class against authoritative catalog; example and class catalog can differ.
- [ ] Execute TypeScript, lint and tests in CI/local development environment.
- [ ] Connect full adapters to registry only after invoice/receipt/status capabilities exist.

## Fiscal-layer testing pass: invoice policies

- [x] Opt-in invoice policy registry for KE and TZ; production code remains unconnected.
- [x] Kenya invoice serializer with exact country casing and tender mapping.
- [x] Tanzania draft invoice serializer requiring explicit fiscal enrichment rather than inventing counters.
- [x] Tests for Kenya multi-tenders, invalid payment values, Tanzania timestamp and missing enrichment.
- [ ] Confirm Tanzania VAT-inclusive rounding and fiscal envelope against real persisted fixtures.
- [ ] Extend canonical invoice with authoritative tax bases, discounts and fiscal metadata before switching production.
- [ ] Check all invoice policy outputs against current vpos-proxy swagger (especially Kenya tender types).
- [ ] Run lint, typecheck and test suite for this pass.

## Fiscal-layer testing pass: invoice wire parity

- [x] Separate lossless proxy-DTO serializer added for KE/TZ (test-only).
- [x] Deep-equality comparison tests against the live country serializer.
- [x] Kenya tender casing, class codes and compact optional-field rules covered.
- [x] Tanzania tax base, fiscal counters, totals, discounts and timestamp preservation covered.
- [x] Reject unsupported countries and invoice/country mismatches explicitly.
- [ ] Execute proxy parity tests, lint and TypeScript checks on fiscal-layer.
- [ ] Replace draft canonical invoice's inferred totals with authoritative totals.
- [ ] Verify product and invoice samples against the latest current proxy Swagger.
- [ ] Only then migrate production routes/workers (separate integration PR).

**Architecture constraint:** The draft canonical invoice adapters remain unconnected.
The new parity serializer deliberately accepts the existing ProxyInvoiceRequest
to identify any lost wire fields before moving to canonical-only mapping.

## Fiscal-layer testing pass: canonical finance (partial)
- [x] Canonical invoice carries authoritative totals, line IDs, tax detail and discounts.
- [x] Financial integrity helper validates non-negative finite amounts and tender reconciliation.
- [x] Kenya draft policy validates against authoritative totals.
- [x] Tanzania draft policy: preserve supplied authoritative financial fields, discounts and totals.
- [ ] Verify full amount and tax parity with production fixtures.
- [ ] Run all fiscal-layer tests, lint and typecheck.

## Tanzania financial mapping pass
- [x] Preserve supplied price extension, net total, tax base, tax amount and discounts.
- [x] Preserve authoritative invoice totals, offline indicator, notes and tender list.
- [x] Preserve line identifiers and commodity codes.
- [x] Add Tanzania regression coverage for authoritative financial values.
- [ ] Confirm exact Tanzania line unit-price semantics and tax-rounding parity against real proxy fixtures.
- [ ] Run repository lint, typecheck and test suite.

## Fiscal-layer testing pass: credit notes

- [x] Canonical credit-note context and shared validation (original document reference, unique credit note ID, reason, user and timestamp).
- [x] Opt-in country credit-note policy registry.
- [x] Kenya draft proxy creditNotes[] envelope, with Lines/lines and original document reference.
- [x] Fail-closed Tanzania adapter: no unverified TRA credit-note output.
- [x] Tests for Kenya envelope, invalid self-reference, unsupported countries and Tanzania fail-closed handling.
- [ ] Verify Kenya-specific credit-note acceptance, tax and reversal sign conventions against current proxy Swagger.
- [ ] Confirm Tanzania fiscal credit-note counters, reference rules and payload against authoritative API.
- [ ] Add real proxy-contract parity fixtures and approval before enabling either path.
- [ ] Run lint, typecheck and targeted tests on fiscal-layer.

## Fiscal-layer testing pass: receipts and fiscal status

- [x] Opt-in Kenya/Tanzania receipt policy registry wraps the existing templates.
- [x] Retain enriched FiscalReceiptModel: no duplicate QR, tax or TRA counter calculations.
- [x] Shared proxy status interpretation with explicit fiscalized/processing/failed/unknown states.
- [x] Never authorize resubmission solely from an error, missing or unknown response.
- [x] Receipt delegation and fiscal status guard tests.
- [ ] Verify all status codes and nested response variants against current proxy Swagger.
- [ ] Correlate invoice-status responses and records before changing any transaction.
- [ ] Introduce country-specific status overrides if proxy contract differences require them.
- [ ] Add real receipt-model fixture snapshots (Kenya/Tanzania) and execute CI.
- [ ] Wire status reconciliation into existing timeout recovery only after end-to-end approval.

## Fiscal-layer testing pass: adapter composition

- [x] Combine Kenya/Tanzania product, invoice, credit-note, receipt and status policies into one explicit test-only layer.
- [x] Resolve aliases once using the central country registry.
- [x] Validate the receipt policy belongs to the selected country.
- [x] Preserve the unconnected production registry and explicit productionConnected=false marker.
- [x] Add composition tests for KE, TZ, unknown country and Tanzania credit-note fail-closed behavior.
- [x] Remove unused FiscalReceiptModel import warning in receipt-and-status-policies.test.ts.
- [ ] Harmonize CountryFiscalizationAdapter interface with the fully composed policy contracts.
- [ ] Keep capability declarations separate from verified runtime readiness, pending endpoint contract tests.
- [ ] Run lint, TypeScript check and tests; do not activate in production.

## Fiscal-layer testing pass: interface alignment and readiness

- [x] Align CountryFiscalizationAdapter with the actual composed product, invoice, credit-note, receipt and status interfaces.
- [x] CountryFiscalLayer explicitly extends the adapter contract.
- [x] Add fail-closed per-country readiness assessment, separate from advertised API capabilities.
- [x] Document blockers for each Kenya and Tanzania feature.
- [x] Keep Tanzania credit notes marked not implemented and both countries unverified/not connected.
- [x] Add type-level composition and readiness guard tests.
- [ ] Run lint, typecheck and targeted tests.
- [ ] Verify each contract against live authoritative swagger and real fixtures before promoting any readiness status.
- [ ] Design opt-in production integration/rollback in a separate pass.

## Fiscal-layer testing pass: deterministic contract comparison

- [x] Add a pure local comparison harness with field-level mismatch paths.
- [x] Compare representative Kenya split-tender, fuel and nonfuel invoice payload.
- [x] Compare representative Tanzania offline invoice with authoritative tax totals, counters and timestamp.
- [x] Keep local serializer parity separate from authoritative proxy API validation.
- [x] Keep readiness explicitly false even when local comparisons match.
- [ ] Run npm run check with new tests and resolve any diagnostics.
- [ ] Confirm current vpos-proxy Swagger endpoint request schemas and response/status semantics.
- [ ] Compare real production-redacted fixtures with both canonical mappers before activation.
- [ ] Extend fixture coverage to credit notes, products and completed fiscal receipts.

## Fiscal-layer testing pass: product and credit-note baseline comparison

- [x] Add Kenya product-registration parity test against the current product-service builder.
- [x] Add Tanzania product-registration parity test against the current individual-upload builder.
- [x] Add Kenya credit-note envelope/reference comparison against existing transaction mapper.
- [x] Keep Tanzania draft credit-note issuance fail-closed.
- [ ] Verify country-specific product overrides and non-fuel classifications with real redacted fixtures.
- [ ] Compare the full Kenya credit-note payload (including reversal signs) after confirming proxy API semantics.
- [ ] Add enriched KE/TZ receipt snapshot fixtures; the receipt policies already delegate to live templates.
- [ ] Validate against authoritative proxy Swagger, not only local code parity.
- [ ] Run npm run check and targeted fiscalization tests after this pass.

## Fiscal-layer testing pass: receipt fixtures and status correlation

- [x] Add representative Kenya and Tanzania enriched receipt model parity tests.
- [x] Test reuse of existing receipt template output rather than duplicating print logic.
- [x] Add side-effect-free document ID correlation gate for fiscal status reconciliation.
- [x] Require explicit, matching proxy document ID before proposing fiscalized state update.
- [x] Never authorize automatic resubmission from unknown, pending or rejected status alone.
- [x] Test mismatched/missing identifiers, pending, failed and confirmed responses.
- [ ] Verify live provider status field/ID semantics against current proxy Swagger.
- [ ] Capture redacted real receipt models and add snapshots covering TRA/KE regulatory format.
- [ ] Test npm run check and targeted new cases.
- [ ] Plan production recovery integration separately, including locking and idempotency.

## Fiscal-layer testing pass: status recovery port

- [x] Define typed status lookup request, result and infrastructure port.
- [x] Implement isolated, side-effect-free recovery assessment.
- [x] Require station and document IDs and strict country normalization before lookup.
- [x] Reuse status correlation guard to reject mismatched documents.
- [x] Treat provider unavailability, transport errors and thrown exceptions as unresolved.
- [x] Never authorize automatic resubmission or database mutation.
- [x] Add fake-port tests for confirmed, mismatched, unavailable and timeout outcomes.
- [ ] Confirm Kenya and Tanzania status endpoint paths, methods, identifiers and response schemas from Swagger.
- [ ] Add real country-specific lookup transport adapters only once contracts are verified.
- [ ] Specify transactional locking, status audit trails and idempotency before worker integration.
- [ ] Run npm run check and fiscalization tests on fiscal-layer.

## Swagger verification pass — cloud/internal/Tanzania (19 Oct 2026)

Sources: uploaded cloud-swagger.json, internal-swagger.json, tanzania-swagger.json.

- [x] Cloud invoice status: GET /api/invoices/status?DocumentId=...
- [x] Tanzania invoice status: GET /api/tanzania/invoices/status?DocumentId=...
- [x] Both invoice status endpoints return InvoiceStatusCollectionResponse (invoices[]), not a single InvoiceResponse.
- [x] Implement pure country-aware endpoint descriptor and strict collection parser.
- [x] Require exactly one matching documentId; reject empty, ambiguous, failed and malformed results.
- [x] Add tests covering endpoint routing, unrelated rows, duplicates and end-to-end recovery assessment with a fake port.
- [x] Cloud credit-note status: GET /api/creditnotes/status?DocumentId=...
- [x] Cloud product status: GET /api/products/status?ProductId=...
- [x] Tanzania products: POST /api/tanzania/products and GET /api/tanzania/products.
- [ ] Add HTTP lookup port implementation with injected authenticated proxy transport after inspecting current client; avoid direct production connection.
- [ ] Confirm whether Kenya route uses cloud invoice status with its configured fiscal device (no Kenya-specific status path appears in the supplied files).
- [ ] Validate real status enum values, HTTP failures, and responseCode meanings against operational samples.
- [ ] IMPORTANT: Tanzania direct invoice submission POST /api/tanzania/invoices expects TanzaniaInvoiceRequest {invoice,items,payments}; distinguish from cloud POST /api/invoices contract.
- [ ] Credit-note full validation, including reversal references and totals, against CreditNoteUploadRequest.
- [ ] Keep country readiness blocked pending response samples, authenticated transport tests, and activation safeguards.

## Fiscal-layer pass: opt-in authenticated status transport

- [x] Inject a status HTTP transport into the isolated status lookup port; no production import.
- [x] Route KE to GET /api/invoices/status and TZ to GET /api/tanzania/invoices/status.
- [x] Require exact document correlation through the collection parser and recovery guard.
- [x] Add a caller-configured authenticated fetch transport with x-api-key, bounded timeout, JSON response parsing, and redirect refusal.
- [x] Prevent status request submission and filesystem/DB writes from new adapters; all operations are GET-only.
- [x] Test routing, URL encoding, authentication, 503 errors, unavailable/malformed responses, and timeouts via fakes.
- [ ] Run npm run check and targeted tests for this pass.
- [ ] Confirm deployment's proxy base path, site API key lookup and client timeout integration with an isolated staging environment.
- [ ] Implement locked, idempotent persistence workflow only after approved production integration pass.
- [ ] Confirm the provider's actual status values from redacted response captures; status wording remains a hypothesis from previous policies.

## Fiscal-layer pass: advisory recovery persistence boundary

- [x] Add a test-only read / atomic compare-and-set persistence port for status recovery.
- [x] Require exact station, document and country match, fiscalizing state, and nonnegative version.
- [x] Restrict writes to confirmed, correlated fiscal status assessments.
- [x] Require the DB adapter to commit state change and audit information in one transaction.
- [x] Preserve no-resubmission semantics for all results.
- [x] Test duplicate recovery, parallel confirmations, mismatched country, invalid version, and unconfirmed outcomes.
- [ ] Implement PostgreSQL compare-and-set with a suitable transaction/version field and unique audit identity after examining existing schema.
- [ ] Add concurrency tests against the actual storage engine before live integration.
- [ ] Verify status-code semantics against redacted successful responses, not just Swagger shapes.
- [ ] Do not wire production transactions/workers until recovery lock, idempotency, and rollback approach approved.

## Recovery persistence schema review and guarded SQL plan

- [x] Fix the two recovery-persistence regression assertions: application outcome is `applied`, not storage `updated`.
- [x] Inspect existing transaction repository, status service, fiscalization-event repository and transaction migration.
- [x] Verify existing transactions store uppercase `FISCALIZING` / `FISCALIZED`, `fiscal_document_id`, station/transaction IDs and soft deletion.
- [x] Record a critical integration mismatch: the actual transactions table has no `version` column, while the test-only recovery port currently assumes one.
- [x] Add a pure guarded PostgreSQL UPDATE statement plan keyed by station ID, transaction ID, fiscal document ID, expected FISCALIZING state and nondeleted rows.
- [x] Add deterministic recovery audit idempotency-key helper and tests. Production must reuse existing fiscalization_events uniqueness in a single DB transaction.
- [ ] Decide whether to replace the version-based port with a row-lock/status-only CAS implementation; do not fake a version from updated_at.
- [ ] Implement the actual PostgreSQL adapter with transactional event persistence and row-count conflict classification only after schema and fiscal metadata lifecycle approval.
- [ ] Confirm recovery does not skip receipt generation, print job handling, or required fiscalization-event compatibility summaries.
- [ ] Run npm run check on the new tests; existing runtime behavior unchanged.

## Recovery transaction boundary pass

- [x] Add a test-only transaction-boundary adapter invoking the schema-aligned guarded UPDATE.
- [x] Require a same-transaction fiscal recovery audit callback; errors propagate for rollback.
- [x] Treat a guarded UPDATE returning zero rows as stale and suppress audit.
- [x] Add fake-transaction tests for duplicate confirmations, audit failures and stale status.
- [ ] Bind to a validated FiscalRecoveryAssessment rather than accepting a standalone confirmation flag.
- [ ] Implement the database transaction client with actual fiscalization_events and compatibility summary semantics.
- [ ] Replace version-based recoveryPersistence port or adapt it explicitly to status-conditional PostgreSQL updates.
- [ ] Prove receipt and print-job parity with the existing completion workflow.
- [ ] Run npm run check; no live worker or database integration in this pass.

## Recovery evidence binding pass

- [x] Remove standalone `confirmed: true` authorization from the isolated transactional recovery adapter.
- [x] Require `FiscalRecoveryAssessment` with confirmed outcome and a matching fiscalized reconciliation decision.
- [x] Verify station ID, document ID and decision country match before beginning a transaction.
- [x] Derive audit observed status from the reconciliation result rather than caller-supplied text.
- [x] Add fail-closed tests for unresolved, mismatched and nonfiscalized evidence.
- [ ] Replace the still-isolated adapter's public plain-object evidence with a trusted status lookup / verification entry point before production integration.
- [ ] Preserve fiscalization event, receipt creation and printing semantics in the actual PostgreSQL integration.
- [ ] Run npm run check. No existing workers, routes or database services modified.

## Lookup-driven recovery workflow pass

- [x] Fix nullable sourceStatus TS18047 by narrowing into a local nonnull variable before audit write.
- [x] Add isolated orchestration from status lookup to confirmed assessment to guarded transactional recovery.
- [x] Disallow persistence when transport fails, a document mismatches, or fiscalization remains pending/failed.
- [x] Test happy path and fail-closed results using injected fake lookup/transaction boundaries.
- [ ] Resolve authenticated production lookup and database transaction implementations; injected ports alone do not establish a trusted external source.
- [ ] Validate real PostgreSQL lock, audit rollback, receipt/printing integration and multiworker idempotency before activation.
- [ ] Run npm run check and new tests. No production worker, route or DB integration was changed.

## Opt-in PostgreSQL recovery audit boundary pass

- [x] Add PostgreSQL transaction boundary using existing withTransaction and txQuery.
- [x] Reuse persistFiscalizationEventRepo to write idempotent SUCCESS event inside the same transaction.
- [x] Persist compatibility summary and latest_fiscal_event_id under station, transaction, document and status constraints.
- [x] Verify latest_fiscal_event_id comes from migration 1258_fiscalization_event_canonical.sql.
- [ ] Validate rollback and parallel-worker behavior against a disposable PostgreSQL database.
- [ ] Confirm receipt creation / enrichment and print queue parity before any worker hookup.
- [ ] Verify status response supplies any missing fiscal receipt fields before showing recovered transaction as complete.
- [ ] Run npm run check; no production route, job, or worker imports this boundary.

## Recovery audit evidence hardening pass

- [x] Reject contradictory invoice status evidence (`error: true` alongside `FISCALIZED` or `SUCCESS`) in the isolated fiscal status normalizer.
- [x] Add workflow negative tests proving contradictory status cannot reach the transaction boundary.
- [x] Extract a transaction-local recovery audit/link validation helper.
- [x] Require a nonempty event ID and exactly one linked transaction row before completing an audit operation.
- [x] Add fake-operation tests for successful linking, audit exceptions, missing evidence, zero links and multiple links.
- [x] Reuse helper in opt-in PostgreSQL recovery transaction boundary; audit/link exceptions propagate through withTransaction for rollback.
- [ ] Run npm run check and fiscalization tests on fiscal-layer.
- [ ] Validate real PostgreSQL rollback and parallel-worker race behavior.
- [ ] Confirm receipt enrichment and auto-print parity before any production integration.

## Contradictory fiscal status regression pass (20 Oct 2026)

- [x] Align the legacy status-policy test with fail-closed handling when `error: true` conflicts with `details.isFiscalized: true`.
- [x] Keep explicit success with `error: false` accepted; unknown and error states never grant automatic retry.
- [x] Reject `details.isFiscalized: true` paired with `FAILED`, `REJECTED` or `ERROR`, even if the top-level error flag is false.
- [x] Add negative regression assertions for conflicting status combinations.
- [ ] Run npm run check and fiscalization tests; no production connections were activated.

## Conditional recovery UPDATE result integrity pass

- [x] Require PostgreSQL RETURNING rows to include transaction ID, station ID, fiscal document ID, and FISCALIZED status.
- [x] Reject mismatched or multiple rows before writing the recovery event/audit, rather than interpreting every nonzero response as success.
- [x] Retain zero-row stale outcome for concurrent or already-finalized transactions.
- [x] Match PostgreSQL boundary row typing to the actual four-column RETURNING projection.
- [x] Extend isolated regression tests for wrong station, transaction, document, status, and multiple rows.
- [ ] Validate guarded transition, rollback, and simultaneous workers against a disposable PostgreSQL instance.
- [ ] Confirm receipt and print parity; no production worker connection is authorized.
- [ ] Run npm run check and fiscalization tests after this pass.

## Receipt and print completion parity assessment (20 Oct 2026)

Existing completion path: `completeTransactionFiscalizationRepo` persists a SUCCESS event, changes transaction status, reuses or creates a receipt, and conditionally enqueues a print job with idempotency key `receipt:<transactionId>:default`. The isolated recovery PostgreSQL boundary currently persists the event, updates status and compatibility summary, but does not yet execute receipt creation or print queue handling.

- [x] Create pure `assessRecoveryCompletionParity` readiness contract.
- [x] Require event linking, persisted receipt ID/number and verified recovered fiscal receipt data.
- [x] When auto-print is enabled, require verified print job idempotency before treating recovery lifecycle as complete.
- [x] Add positive and negative regression tests for missing receipt, fiscal data, audit and conditional print handling.
- [ ] Integrate the parity check with transactional recovery only after receipt handling is genuinely implemented. Current readiness inputs must not be inferred or hardcoded as true.
- [ ] Resolve whether normal completion's `generateReceipt` is safe inside its existing transactional callback; do not blindly reuse with an unrelated database client.
- [ ] Add real PostgreSQL concurrency, rollback and receipt/print transactional integration tests.
- [ ] Do not activate recovery worker while receipt and print parity are outstanding.

## Isolated recovered receipt completion coordinator

- [x] Add injected recovery receipt completion coordinator with existing receipt reuse and optional receipt creation.
- [x] Require an already-linked fiscalization event before receipt operations.
- [x] Reject incomplete or unverified fiscal receipt data before attempting auto-print.
- [x] Use normal completion's idempotency key format `receipt:<transactionId>:default`.
- [x] Only require idempotent print job verification when automatic printing is enabled.
- [x] Test existing receipt reuse, missing receipt creation, unverified receipt, missing event and unverified print idempotency with fake ports.
- [ ] Implement database-backed receipt creation and verification in the same recovery transaction. Current port's `fiscalDataVerified` is caller supplied and not authoritative.
- [ ] Wire completion into atomic PostgreSQL recovery only when all receipt-fiscalization fields and transaction consistency are proven.
- [ ] Add actual database concurrency and rollback tests; until then recovery worker remains disconnected.
