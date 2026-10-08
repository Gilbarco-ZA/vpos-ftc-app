# Historical transaction and report purge

The administrator page at `/admin/maintenance` provides date-range counts for historical transactions and reports. Choose **Transactions** or **Reports**, enter **From** and **To** dates, then select **Count records**. Both totals appear for the selected date range; the selection controls the per-kind eligibility detail.

## What can be deleted

Only **FTC-native fiscalized transactions** currently qualify for execution. Eligible rows must have a successful `fiscalization_events` event with `origin = 'runtime'`, a non-null `fiscalized_at`, no legacy filename, and no legacy-import/backfill fiscalization events. This uses the application’s operational assumption that successful native fiscalization confirms cloud delivery.

**Legacy imports** require independent, durable cloud delivery confirmation. Neither the legacy filename nor a `FISCALIZED` status proves upload. These transactions are excluded from deletion. **Reports** likewise remain in preview-only mode until a durable cloud-delivery acknowledgement can be resolved per report.

The preview count of native fiscalized transactions is an *upper bound*, not a deletion guarantee: queued work, credit notes, EWURA records, Tanzania invoice counter assignments, or unsafe foreign-key dependencies can further exclude rows.

## Execute an eligible transaction purge

1. Use an approved maintenance window, keep an external copy of the station's latest restorable backup, and ensure fiscalization/proxy workers are healthy.
2. On `/admin/maintenance`, choose **Transactions**, select the date range, and preview counts.
3. Confirm that the date range is historical. Purging a range ending today or later is prohibited.
4. Type the exact confirmation shown: `PURGE TRANSACTIONS YYYY-MM-DD YYYY-MM-DD`.
5. Run one purge batch. The server creates a new PostgreSQL database backup before deletion. The batch selects at most **50** transactions, performs dependent-row and FK checks, deletes matching receipt rows explicitly, and relies on the schema’s `ON DELETE` rules for remaining FK-linked rows. The deletion and audit entry commit atomically.
6. Refresh the preview. Repeat deliberately if additional eligible records remain. Each invocation makes a separate backup.

The endpoint is administrator-only and CSRF protected. `POST /api/admin/system/purge/execute` accepts `{kind:'transactions',startDate,endDate,confirmation,csrf_token}`.

## Protection and retention boundaries

- No legacy or backfilled fiscalized transaction is purged without an independent upload acknowledgement.
- No report is purged until upload confirmation can be tied to each report.
- Active transaction queues and print jobs block deletion of their referenced transaction.
- Rows with Tanzania invoice counter assignments, credit notes or EWURA transaction records are excluded.
- Unexpected restrictive FK dependencies prevent execution rather than bypassing referential integrity.
- The newest backup must be retained externally according to site policy. Automatic local backups are a recovery measure, not a substitute for off-device retention.
- Purge is irreversible from the UI except through restoring a suitable pre-purge database backup. Restoring the database is a maintenance-window procedure.
- PostgreSQL may not immediately return disk space to the OS following deletion. Use regular `VACUUM (ANALYZE)` and monitor table/index bloat. Do **not** run `VACUUM FULL` casually on the live station; it requires intrusive locks and additional free disk.
- Cloud upload acknowledgements and a regulatory retention review remain prerequisites for extending deletion to reports and legacy transactions.
