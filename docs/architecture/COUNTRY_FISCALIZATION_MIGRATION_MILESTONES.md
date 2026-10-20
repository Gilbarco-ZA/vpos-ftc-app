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
- [ ] Authoritative KE/TZ fiscal-reference and receipt field mapping, based on provider samples.
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
