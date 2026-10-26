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
- When receipt printing is configured before fiscalization, a healthy printer still preserves print-before-fiscalize ordering. If the print worker confirms that the configured printer is unavailable because of a transport, DNS, network, or socket failure, fiscalization fails open rather than blocking the sale. The receipt print job remains pending for retry and can be released when printer connectivity returns. Receipt rendering, data, or other non-connectivity print failures continue to block the pre-fiscalization gate.

Fiscal Inbox administrators can view the recorded outgoing proxy request payload and proxy response associated with a transaction's fiscalization event. Inbox messages with a fiscal event ID open that specific attempt; otherwise, the detail page labels its evidence as the latest proxy attempt for the related transaction, which may not be the attempt that generated the inbox message. The diagnostic query is station-scoped and shows redacted, persisted evidence rather than re-sending the invoice. For new proxy invoice submissions, event request evidence is captured from the same country-specific, null-stripped body passed to the HTTP transport; historical records may contain the pre-transport invoice model. Pending attempts can contain a submission acknowledgment plus a later final response. If no event is available, the UI explicitly says so. Treat displayed buyer information as confidential.

Kenya proxy-routed transactions remaining `FISCALIZING` are also reconciled through the authoritative `GET /api/invoices/status?DocumentId=...` lookup. Admin/manager transaction refresh can request a targeted check of currently visible pending records; the proxy sender worker checks up to its configured pending batch unattended every 10 minutes, even with no open browser. Only a uniquely matched DocumentId and a terminal invoice status (`Approved`, `Fiscalized`, `Completed`, `Failed`, `Rejected`, or `Declined`) can change local status; `Pending`, empty results, connection errors, and an HTTP 200 envelope alone do not finalize. Updates retain sanitized fiscal-event request/response evidence and use transaction row locks to prevent concurrent duplicate finalization. This is status reconciliation, **not** a resend of the invoice. The existing short-window bulk polling remains in place. The lookup uses the configured station proxy URL, not a browser request to `0.0.0.0`.

## Product stock lifecycle

Manual/POS transaction capture reserves non-fuel product stock immediately by creating transaction-linked stock-out ledger movements. The transaction write and stock reconciliation share one database transaction, so insufficient stock rejects the whole capture.

While a transaction remains editable and non-fiscalized, replacing its lines reconciles the stock ledger to the final quantities rather than deducting the full transaction again. Quantity increases create stock-out deltas; quantity decreases and removals create stock-in corrections. Fuel-category lines remain owned by tank inventory and are excluded.

Fiscalization does not create another product stock movement. Transaction-originated stock movements remain local-only because the invoice submission to `/api/invoices` is responsible for applying sold line quantities on the cloud server. Manual and CSV stock adjustments continue to use the separate stock proxy flow and remain available for retry from Product Stock when delivery fails.

The canonical proxy contract currently lives under the transactions fiscalization infrastructure; shared paths are compatibility exports only.
