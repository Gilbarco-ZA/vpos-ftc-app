-- Phase 3A: make fiscalization_events the authoritative runtime attempt store.
--
-- transactions.fiscalization_response remains as a compatibility column during
-- the transition, but new writers persist only a bounded event pointer/summary.
-- Existing legacy/imported full responses remain untouched for fallback reads.

ALTER TABLE fiscalization_events
  DROP CONSTRAINT IF EXISTS fiscalization_events_engine_check;

ALTER TABLE fiscalization_events
  ALTER COLUMN engine TYPE VARCHAR(32);

ALTER TABLE fiscalization_events
  ADD CONSTRAINT fiscalization_events_engine_check
  CHECK (NULLIF(BTRIM(engine), '') IS NOT NULL) NOT VALID;

ALTER TABLE fiscalization_events
  VALIDATE CONSTRAINT fiscalization_events_engine_check;

ALTER TABLE fiscalization_events
  DROP CONSTRAINT IF EXISTS fiscalization_events_status_check;

ALTER TABLE fiscalization_events
  ADD CONSTRAINT fiscalization_events_status_check
  CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')) NOT VALID;

ALTER TABLE fiscalization_events
  VALIDATE CONSTRAINT fiscalization_events_status_check;

ALTER TABLE fiscalization_events
  ADD COLUMN IF NOT EXISTS transport VARCHAR(20) NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'runtime',
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fiscalization_events_transport_check'
      AND conrelid = 'fiscalization_events'::regclass
  ) THEN
    ALTER TABLE fiscalization_events
      ADD CONSTRAINT fiscalization_events_transport_check
      CHECK (transport IN ('internal', 'proxy', 'legacy')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE fiscalization_events
  VALIDATE CONSTRAINT fiscalization_events_transport_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fiscalization_events_origin_check'
      AND conrelid = 'fiscalization_events'::regclass
  ) THEN
    ALTER TABLE fiscalization_events
      ADD CONSTRAINT fiscalization_events_origin_check
      CHECK (origin IN ('runtime', 'legacy_import', 'backfill')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE fiscalization_events
  VALIDATE CONSTRAINT fiscalization_events_origin_check;

UPDATE fiscalization_events
   SET finalized_at = COALESCE(finalized_at, occurred_at, created_at)
 WHERE status IN ('SUCCESS', 'FAILED')
   AND finalized_at IS NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS latest_fiscal_event_id UUID;

CREATE INDEX IF NOT EXISTS idx_fisc_events_station_txn_latest
  ON fiscalization_events (
    station_id,
    transaction_id,
    occurred_at DESC,
    created_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_fisc_events_station_idempotency
  ON fiscalization_events (station_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_latest_fiscal_event
  ON transactions (latest_fiscal_event_id)
  WHERE latest_fiscal_event_id IS NOT NULL;

WITH latest AS (
  SELECT DISTINCT ON (station_id, transaction_id)
         station_id,
         transaction_id,
         id
    FROM fiscalization_events
   ORDER BY station_id, transaction_id, occurred_at DESC, created_at DESC
)
UPDATE transactions t
   SET latest_fiscal_event_id = latest.id
  FROM latest
 WHERE t.station_id = latest.station_id
   AND t.id = latest.transaction_id
   AND t.latest_fiscal_event_id IS NULL;

COMMENT ON COLUMN transactions.fiscalization_response IS
  'Compatibility-only fiscalization event summary for new writes; legacy imported rows may still contain a full response until fallback reads are retired.';
COMMENT ON COLUMN transactions.latest_fiscal_event_id IS
  'Application-maintained pointer to the latest authoritative fiscalization_events row. No FK is used because transaction and event sync ordering is bidirectional.';
COMMENT ON COLUMN fiscalization_events.transport IS
  'Transport used for the attempt: internal, proxy, or legacy.';
COMMENT ON COLUMN fiscalization_events.schema_version IS
  'Schema version of the persisted fiscal request/response payload contract.';
COMMENT ON COLUMN fiscalization_events.payload_hash IS
  'SHA-256 hash of the sanitized request and response payloads when written by the runtime.';
COMMENT ON COLUMN fiscalization_events.idempotency_key IS
  'Optional station-scoped idempotency key used to update one proxy attempt through its lifecycle.';
