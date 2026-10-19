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
- [ ] Tanzania draft policy: switch to supplied authoritative financial fields (pending).
- [ ] Verify full amount and tax parity with production fixtures.
- [ ] Run all fiscal-layer tests, lint and typecheck.
