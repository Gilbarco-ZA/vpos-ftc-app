# Transactions and Fiscalization

**Type:** authoritative

The transactions module owns transaction lifecycle, line and payment data, fiscalization orchestration, retry state, proxy submission, and audit history. Fiscal inbox behavior is separated into its own module but participates in the same recovery model.

## Principles

- Fiscal requests must be idempotent and traceable to the originating transaction.
- Retry state and terminal failure state must survive restarts.
- Payload mapping must be deterministic and covered by contract tests.
- Fiscalization retry rebuilds generic pump/nozzle/tank/product enrichment from the current relational station configuration. For Tanzania fuel invoices, the regulatory `tankId`/`tankVolume` is then overridden by the persisted transaction tank projection so retries reuse the original ATG baseline and representative tank rather than changing to a newer gauge snapshot. Anonymous DOMS/JPL fuel transactions follow the same anonymous fiscalization policy on manual retry as they do during automatic fiscalization.
- Customer and fiscal data must be redacted from logs.
- Route handlers should delegate to application services rather than write persistence directly.
- Compatibility reads must have an explicit retirement gate before removal.
- For DOMS fuel sales, pump-session completion and JPL transaction-buffer capture are two observations of the same physical sale. They must converge on one `transactions` row under a shared advisory lock. When one path has already persisted a matching sale on the same pump/nozzle within the station linking window and with matching amount/volume, the other path attaches its correlation metadata instead of inserting a duplicate transaction.
- `/transactions` and `/receipts` default to the station's current business day. Date-only filters are interpreted in the configured `fuel_stations.timezone`, with an exclusive next-day upper boundary so daylight-saving and UTC offsets do not omit or duplicate records. Operators can explicitly select **All dates** or a custom range.

## Product stock lifecycle

Manual/POS transaction capture reserves non-fuel product stock immediately by creating transaction-linked stock-out ledger movements. The transaction write and stock reconciliation share one database transaction, so insufficient stock rejects the whole capture.

While a transaction remains editable and non-fiscalized, replacing its lines reconciles the stock ledger to the final quantities rather than deducting the full transaction again. Quantity increases create stock-out deltas; quantity decreases and removals create stock-in corrections. Fuel-category lines remain owned by tank inventory and are excluded.

Fiscalization does not create another product stock movement. Transaction-originated stock movements remain local-only because the invoice submission to `/api/invoices` is responsible for applying sold line quantities on the cloud server. Manual and CSV stock adjustments continue to use the separate stock proxy flow and remain available for retry from Product Stock when delivery fails.

The canonical proxy contract currently lives under the transactions fiscalization infrastructure; shared paths are compatibility exports only.
