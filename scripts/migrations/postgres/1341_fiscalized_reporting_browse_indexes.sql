-- Keep fiscalized transaction/report browsing index-backed even when legacy
-- rows are identified by status before fiscalized_at was populated.
--
-- The API predicate intentionally supports both forms:
--   fiscalized_at IS NOT NULL OR UPPER(COALESCE(status, '')) = 'FISCALIZED'
-- Without a matching partial index, "all dates" and month-range receipt/report
-- reads can scan and sort the full station history before applying LIMIT.

CREATE INDEX IF NOT EXISTS idx_transactions_station_fiscalized_browse_active
  ON transactions (
    station_id,
    fiscalized_at DESC NULLS LAST,
    transaction_date_time DESC
  )
  WHERE deleted_at IS NULL
    AND (
      fiscalized_at IS NOT NULL
      OR UPPER(COALESCE(status, '')) = 'FISCALIZED'
    );

CREATE INDEX IF NOT EXISTS idx_transactions_station_date_fiscalized_browse_active
  ON transactions (
    station_id,
    transaction_date_time DESC,
    fiscalized_at DESC NULLS LAST
  )
  WHERE deleted_at IS NULL
    AND (
      fiscalized_at IS NOT NULL
      OR UPPER(COALESCE(status, '')) = 'FISCALIZED'
    );

