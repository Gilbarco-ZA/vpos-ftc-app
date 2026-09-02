-- Tanzania proxy responses may omit documentId even though FTC supplied it in
-- the successful request. Backfill only from authoritative SUCCESS event data.

WITH latest_success AS (
  SELECT DISTINCT ON (fe.station_id, fe.transaction_id)
         fe.station_id,
         fe.transaction_id,
         NULLIF(BTRIM(fe.request_payload->>'documentId'), '') AS document_id
    FROM fiscalization_events fe
   WHERE fe.status = 'SUCCESS'
     AND NULLIF(BTRIM(fe.request_payload->>'documentId'), '') IS NOT NULL
   ORDER BY fe.station_id,
            fe.transaction_id,
            fe.occurred_at DESC,
            fe.created_at DESC
)
UPDATE transactions t
   SET fiscal_document_id = success.document_id,
       updated_at = NOW()
  FROM latest_success success
 WHERE t.station_id = success.station_id
   AND t.id = success.transaction_id
   AND NULLIF(BTRIM(t.fiscal_document_id), '') IS NULL;
