# Country fiscalization migration — active milestones

This is the current actionable overview. The detailed
[COUNTRY_FISCALIZATION_MIGRATION_CHECKLIST.md](./COUNTRY_FISCALIZATION_MIGRATION_CHECKLIST.md)
is retained as chronological pass history; some earlier unchecked items were
partially or fully superseded by later implementations. Completion below
requires evidence, not merely isolated unit tests.

## M1. Recovery completion — IN PROGRESS

- [x] Status lookup, correlated status guard, guarded state transition and audit.
- [x] Unified opt-in PostgreSQL transaction, persisted receipt verification and idempotent printing.
- [x] Transaction-scoped receipt identity read and guarded insert **from supplied complete evidence**.
- [x] Add transaction-scoped linked fiscal-event provenance read and block receipt creation from status-only synthetic audit events.
- [x] Introduce conservative KE/TZ status-field inventory and same-name conflict detection without promoting unverified fields to fiscal references.
- [x] Add redaction-safe field-by-field review (missing, status-only, event-only, matching, conflicting, invalid) with no automatic authorization.
- [ ] Authoritative KE/TZ fiscal-reference and receipt field mapping, based on redacted operational provider samples.
- [ ] Build a complete receipt candidate using transaction-scoped queries; current normal receipt builder reads through its own pool.
- [x] Integrate optional guarded receipt insertion into the unified transaction and reverify exact receipt identity and fiscal data before printing. No candidate source is live yet.
- [ ] Disposable PostgreSQL concurrency, rollback and print idempotency validation.
- [ ] Controlled production recovery worker hookup and operational safeguards.

## M2. Country API and fiscal payload parity — OPEN

- [ ] Validate Kenya and Tanzania invoice, tender, tax, rounding and credit-note schemas against authoritative proxy contract and redacted payloads.
- [ ] Confirm product classifications, registration and batch failure handling.
- [ ] Confirm country receipt fiscal values (verification details, counters and signature) and templates.

## M3. Country operations — OPEN

- [ ] Tanzania tank reconciliation for ATG outage and sites without ATG.
- [ ] Tanzania TRA counters/reporting; supported Kenya inventory/reporting capabilities.

## M4. Activation and rollout — OPEN

- [ ] Country-specific adapters and feature-supported status reporting.
- [ ] Shadow parity comparison, station-level opt-in/rollback controls, monitoring.
- [ ] Staging validation then controlled per-site activation for Kenya and Tanzania.

**Safety:** No production recovery worker should use the new fiscalization
layer until M1 and the applicable country parity/rollout gates are satisfied.
Do not treat a generic status success as receipt fiscal metadata. The guarded
receipt writer cannot create a receipt without a complete authoritative
candidate and a verified persisted transaction/event.

## Fiscal event provenance gate (20 Oct 2026)

Missing receipt insertion now independently reads the exact linked fiscalization event within the recovery transaction. It rejects mismatched document, event ID, status or reference, nonstructured response payloads, and synthetic `vpos-proxy-status-recovery` audit events. This is deliberate: a status confirmation does not include the authoritative receipt data needed for generation. A future provider-specific adapter must establish that provenance before creating a candidate; accepting an arbitrary caller-supplied receipt snapshot is not enough. The new reader **does not** manufacture fiscal receipt fields or activate the recovery worker.

## KE/TZ status field mapping baseline (20 Oct 2026)

The isolated `recoveryProviderFieldInventory` preserves the five named status fields (`fiscalId`, `fiscalCode`, `fiscalVerificationCode`, `fiscalQrCodeData`, `revenueAuthorityReference`). It can report missing fields and contradictory fields when **the same exact field name** is present on a linked provider response. It does not interpret aliases, traverse unrelated nested payloads, infer event reference identities, or provide receipt authorization; `referenceMappingApproved` always remains false. A real provider contract sample and approved country-specific mapping are still required. This helper is not wired into production.

## Mapping review evidence (20 Oct 2026)

Use `buildRecoveryProviderReview` to compare precisely named KE/TZ status and linked-event fields. Reports contain presence and conflict classifications only—not raw fiscal identifiers or QR data. Even five matching names do not establish country-specific fiscal reference semantics; `mappingReady` and `receiptCreationAuthorized` remain false until explicitly approved against authoritative provider samples. No worker integration or fiscal-reference writes were added.
