-- Phase 4B: bounded forecourt event history, compact tank-gauge diagnostics,
-- and cleanup indexes for finalized unattended payload duplication.

ALTER TABLE forecourt_events
  ADD COLUMN IF NOT EXISTS retention_class TEXT NOT NULL DEFAULT 'routine',
  ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS payload_schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payload_compacted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'forecourt_events_retention_class_check'
  ) THEN
    ALTER TABLE forecourt_events
      ADD CONSTRAINT forecourt_events_retention_class_check
      CHECK (retention_class IN (
        'routine',
        'error',
        'maintenance_security',
        'field_evidence'
      ));
  END IF;
END
$$;

UPDATE forecourt_events
   SET retention_class = CASE
         WHEN lower(source || ' ' || event_type)
              ~ '(field[_ .-]?validation|commissioning|deployment[_ .-]?sign[_ .-]?off|acceptance|evidence|fcinstallstatus|tgstatus[_ .-]?resp|tankdeliverydata[_ .-]?resp)'
           THEN 'field_evidence'
         WHEN lower(source) = 'admin'
           OR lower(event_type)
              ~ '(maintenance|mapping|command|authorization|security|session|replay[_ .-]?transaction[_ .-]?restored|rollback|remediation)'
           THEN 'maintenance_security'
         WHEN lower(source || ' ' || event_type)
              ~ '(error|failed|failure|fault|alarm|timeout|disconnect|rejected|denied|blocked|invalid)'
           OR lower(COALESCE(payload->>'status', '') || ' ' ||
                    COALESCE(payload->>'state', '') || ' ' ||
                    COALESCE(payload->>'outcome', '') || ' ' ||
                    COALESCE(payload->>'result', '') || ' ' ||
                    COALESCE(payload->>'message', ''))
              ~ '(error|failed|failure|fault|alarm|timeout|disconnect|rejected|denied|blocked|invalid)'
           THEN 'error'
         ELSE 'routine'
       END,
       payload_hash = COALESCE(payload_hash, md5(payload::text)),
       payload_schema_version = COALESCE(payload_schema_version, 1)
 WHERE payload_hash IS NULL
    OR retention_class = 'routine';

CREATE INDEX IF NOT EXISTS idx_forecourt_events_retention
  ON forecourt_events(station_id, retention_class, occurred_at, id);

ALTER TABLE tanks
  ADD COLUMN IF NOT EXISTS last_tg_diagnostics JSONB,
  ADD COLUMN IF NOT EXISTS last_tg_payload_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_tg_payload_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_tg_payload_clear_reason TEXT;

UPDATE tanks
   SET last_tg_payload_hash = COALESCE(last_tg_payload_hash, md5(last_tg_payload::text)),
       last_tg_diagnostics = COALESCE(
         last_tg_diagnostics,
         jsonb_strip_nulls(
           jsonb_build_object(
             'schemaVersion', 1,
             'tgId', COALESCE(
               last_tg_payload->>'TgId',
               last_tg_payload->>'tgId',
               doms_tank_id,
               code
             ),
             'capturedAt', live_volume_updated_at,
             'liveVolumeLitres', live_volume_litres,
             'productLevel', COALESCE(
               last_tg_payload->'TankProductLevel',
               last_tg_payload->'tankProductLevel',
               last_tg_payload->'ProductLevel',
               last_tg_payload->'productLevel'
             ),
             'waterLevel', COALESCE(
               last_tg_payload->'TankWaterLevel',
               last_tg_payload->'tankWaterLevel',
               last_tg_payload->'WaterLevel',
               last_tg_payload->'waterLevel'
             ),
             'waterVolumeLitres', COALESCE(
               last_tg_payload->'TankWaterVol',
               last_tg_payload->'tankWaterVol',
               last_tg_payload->'WaterVolume',
               last_tg_payload->'waterVolume'
             ),
             'averageTemperatureC', COALESCE(
               last_tg_payload->'TankAverageTemp',
               last_tg_payload->'tankAverageTemp',
               last_tg_payload->'AverageTemperature',
               last_tg_payload->'averageTemperature'
             ),
             'sourcePayloadHash', md5(last_tg_payload::text),
             'legacyBackfill', TRUE
           )
         )
       )
 WHERE last_tg_payload IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tanks_tg_payload_compaction
  ON tanks(station_id, live_volume_updated_at, id)
  WHERE last_tg_payload IS NOT NULL
    AND last_tg_diagnostics IS NOT NULL
    AND last_tg_payload_cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_unattended_payload_compaction
  ON transactions(station_id, doms_cleared_at, id)
  WHERE doms_source_system = 'jpl'
    AND (
      doms_unattended_receipt_json IS NOT NULL
      OR doms_unattended_payment_json IS NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_forecourt_transactions_unattended_compaction
  ON forecourt_transactions(station_id, normalized_transaction_id, occurred_at, id)
  WHERE doms_unattended_receipt_json IS NOT NULL
     OR doms_unattended_payment_json IS NOT NULL;
