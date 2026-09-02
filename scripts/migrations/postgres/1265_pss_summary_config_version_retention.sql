-- Phase 5C: replace persisted parsed PSS XML with compact metadata and prepare
-- configuration version tables for bounded, pinned retention.
--
-- This migration is deliberately non-destructive:
-- - it does not delete pss.xml.parsed rows;
-- - it does not prune configuration history;
-- - it does not pin or unpin any existing version.
-- The dry-run-first station retention worker performs later cleanup.

ALTER TABLE station_config_versions
  ADD COLUMN IF NOT EXISTS config_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_reason TEXT;

ALTER TABLE plugin_config_versions
  ADD COLUMN IF NOT EXISTS config_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_reason TEXT;

ALTER TABLE device_config_versions
  ADD COLUMN IF NOT EXISTS config_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_station_config_versions_hash'
  ) THEN
    ALTER TABLE station_config_versions
      ADD CONSTRAINT ck_station_config_versions_hash
      CHECK (config_hash IS NULL OR config_hash ~ '^[0-9a-f]{64}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_plugin_config_versions_hash'
  ) THEN
    ALTER TABLE plugin_config_versions
      ADD CONSTRAINT ck_plugin_config_versions_hash
      CHECK (config_hash IS NULL OR config_hash ~ '^[0-9a-f]{64}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_device_config_versions_hash'
  ) THEN
    ALTER TABLE device_config_versions
      ADD CONSTRAINT ck_device_config_versions_hash
      CHECK (config_hash IS NULL OR config_hash ~ '^[0-9a-f]{64}$') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS station_config_versions_retention_idx
  ON station_config_versions (station_id, created_at DESC, id DESC)
  WHERE is_pinned = FALSE;

CREATE INDEX IF NOT EXISTS plugin_config_versions_retention_idx
  ON plugin_config_versions (
    station_id,
    process_type,
    plugin_name,
    created_at DESC,
    id DESC
  )
  WHERE is_pinned = FALSE;

CREATE INDEX IF NOT EXISTS device_config_versions_retention_idx
  ON device_config_versions (
    station_id,
    device_type,
    device_key,
    created_at DESC,
    id DESC
  )
  WHERE is_pinned = FALSE;

COMMENT ON COLUMN station_config_versions.config_hash IS
  'SHA-256 of normalized config JSON for duplicate-write suppression.';
COMMENT ON COLUMN station_config_versions.is_pinned IS
  'Protects a deployment or rollback version from count-based retention.';
COMMENT ON COLUMN plugin_config_versions.is_pinned IS
  'Protects a deployment or rollback version from count-based retention.';
COMMENT ON COLUMN device_config_versions.is_pinned IS
  'Protects a deployment or rollback version from count-based retention.';

-- Backfill compact PSS import summaries only when a summary is not already
-- present. Counts are derived from the legacy parsed object; normalized counts
-- remain zero because legacy rows did not record the exact upsert result.
INSERT INTO station_kv (station_id, key, value, created_at, updated_at)
SELECT parsed.station_id,
       'pss.xml.importSummary',
       jsonb_build_object(
         'version', 1,
         'sourceChecksum', COALESCE(checksum.value #>> '{}', ''),
         'sourcePath', NULL,
         'importedAt', COALESCE(imported_at.value #>> '{}', ''),
         'sourceBytes', COALESCE(octet_length(raw_xml.value #>> '{}'), 0),
         'parsedCounts', jsonb_build_object(
           'grades', CASE
             WHEN jsonb_typeof(parsed.value->'grades') = 'array'
             THEN jsonb_array_length(parsed.value->'grades') ELSE 0 END,
           'priceGroups', CASE
             WHEN jsonb_typeof(parsed.value->'priceGroups') = 'array'
             THEN jsonb_array_length(parsed.value->'priceGroups') ELSE 0 END,
           'products', CASE
             WHEN jsonb_typeof(parsed.value->'products') = 'array'
             THEN jsonb_array_length(parsed.value->'products') ELSE 0 END,
           'tanks', CASE
             WHEN jsonb_typeof(parsed.value->'tanks') = 'array'
             THEN jsonb_array_length(parsed.value->'tanks') ELSE 0 END,
           'tankGauges', CASE
             WHEN jsonb_typeof(parsed.value->'tankGauges') = 'array'
             THEN jsonb_array_length(parsed.value->'tankGauges') ELSE 0 END,
           'fuellingPoints', CASE
             WHEN jsonb_typeof(parsed.value->'fuellingPoints') = 'array'
             THEN jsonb_array_length(parsed.value->'fuellingPoints') ELSE 0 END,
           'gradeOptions', CASE
             WHEN jsonb_typeof(parsed.value->'fuellingPoints') = 'array'
             THEN COALESCE((
               SELECT SUM(
                 CASE
                   WHEN jsonb_typeof(point->'gradeOptions') = 'array'
                   THEN jsonb_array_length(point->'gradeOptions')
                   ELSE 0
                 END
               )
               FROM jsonb_array_elements(parsed.value->'fuellingPoints') point
             ), 0)
             ELSE 0
           END
         ),
         'normalizedCounts', jsonb_build_object(
           'products', 0,
           'tanks', 0,
           'pumps', 0
         )
       ),
       parsed.created_at,
       NOW()
  FROM station_kv parsed
  LEFT JOIN station_kv imported_at
    ON imported_at.station_id = parsed.station_id
   AND imported_at.key = 'pss.xml.lastImportAt'
  LEFT JOIN station_kv checksum
    ON checksum.station_id = parsed.station_id
   AND checksum.key = 'pss.xml.lastImportChecksum'
  LEFT JOIN station_kv raw_xml
    ON raw_xml.station_id = parsed.station_id
   AND raw_xml.key = 'pss.xml.raw'
 WHERE parsed.key = 'pss.xml.parsed'
   AND jsonb_typeof(parsed.value) = 'object'
ON CONFLICT (station_id, key) DO NOTHING;

COMMENT ON COLUMN station_kv.value IS
  'Canonical JSON value. Legacy pss.xml.parsed entries are compatibility-only and may be removed by retention after pss.xml.importSummary, raw XML, and ID map are present.';
