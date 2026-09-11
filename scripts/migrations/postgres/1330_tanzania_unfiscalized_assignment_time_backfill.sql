-- Align unsent Tanzania receipt assignments with the originating transaction time.
--
-- Older pre-fiscal receipt assignments used the worker execution time for
-- invoice_date. Restrict this correction to transactions that have neither a
-- final fiscalization reference nor a proxy/cloud request correlation, so no
-- completed or already-submitted fiscal document is rewritten.
UPDATE tanzania_proxy_invoice_assignments a
   SET invoice_date = t.transaction_date_time
  FROM transactions t
 WHERE t.station_id = a.station_id
   AND t.id = a.transaction_id
   AND t.deleted_at IS NULL
   AND t.fiscalization_reference IS NULL
   AND t.cloud_transaction_id IS NULL
   AND t.status IN ('OPEN', 'ALLOCATED', 'PENDING', 'FAILED', 'FISCALIZING')
   AND a.invoice_date IS DISTINCT FROM t.transaction_date_time;
