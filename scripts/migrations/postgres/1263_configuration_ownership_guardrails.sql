-- Phase 5A: configuration ownership and station_kv guardrails.
-- This migration is intentionally non-destructive. It prepares legacy columns
-- and the unused generic job table for a later, deployment-approved removal.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'station_settings'
       AND column_name = 'key'
  ) THEN
    ALTER TABLE station_settings ALTER COLUMN key DROP NOT NULL;
    ALTER TABLE station_settings DROP CONSTRAINT IF EXISTS station_settings_key_key;
    DROP INDEX IF EXISTS idx_station_settings_key;

    COMMENT ON COLUMN station_settings.key IS
      'Deprecated compatibility column. Current settings use typed columns; no new application writes.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'station_settings'
       AND column_name = 'value_json'
  ) THEN
    COMMENT ON COLUMN station_settings.value_json IS
      'Deprecated compatibility column. Current settings use typed columns; pending deployment-level dependency audit before drop.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass(current_schema() || '.station_kv') IS NOT NULL THEN
    COMMENT ON TABLE station_kv IS
      'Small station-scoped operational/configuration compatibility store. New writes must pass the application ownership and size policy.';
    COMMENT ON COLUMN station_kv.value IS
      'Canonical station_kv value. Key-specific ownership and size limits are enforced by application policy.';

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'station_kv'
         AND column_name = 'value_json'
    ) THEN
      COMMENT ON COLUMN station_kv.value_json IS
        'Deprecated duplicate column with no current application reader/writer; pending deployment-level dependency audit before drop.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conname = 'ck_station_kv_key_shape'
         AND conrelid = to_regclass(current_schema() || '.station_kv')
    ) THEN
      ALTER TABLE station_kv
        ADD CONSTRAINT ck_station_kv_key_shape
        CHECK (
          char_length(BTRIM(key)) BETWEEN 1 AND 160
          AND key !~ '[[:space:]]'
        ) NOT VALID;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conname = 'ck_station_kv_value_size'
         AND conrelid = to_regclass(current_schema() || '.station_kv')
    ) THEN
      ALTER TABLE station_kv
        ADD CONSTRAINT ck_station_kv_value_size
        CHECK (
          octet_length(value::text) <= CASE
            WHEN key LIKE 'env:%' THEN 16384
            ELSE 8388608
          END
        ) NOT VALID;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass(current_schema() || '.job_queue') IS NOT NULL THEN
    COMMENT ON TABLE job_queue IS
      'Deprecated generic queue. No current application reader/writer; do not use for new work. Pending site database audit before drop.';
  END IF;
END $$;
