-- Runtime archive retention support.
-- The runtime archive is diagnostic-only and is disabled by default in code.
-- This index keeps age-based bounded cleanup efficient across all stations.

CREATE INDEX IF NOT EXISTS archive_events_created_id_idx
  ON archive_events (created_at, id);
