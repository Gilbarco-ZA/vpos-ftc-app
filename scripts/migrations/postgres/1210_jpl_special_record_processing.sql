ALTER TABLE forecourt_jpl_service_messages
  ADD COLUMN IF NOT EXISTS service_code VARCHAR(16),
  ADD COLUMN IF NOT EXISTS route_key VARCHAR(64),
  ADD COLUMN IF NOT EXISTS route_label TEXT,
  ADD COLUMN IF NOT EXISTS route_severity VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS route_status VARCHAR(24) NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS route_summary TEXT,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

ALTER TABLE forecourt_jpl_back_office_records
  ADD COLUMN IF NOT EXISTS record_kind VARCHAR(64),
  ADD COLUMN IF NOT EXISTS record_label TEXT,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS process_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_process_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS replay_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_replayed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_service_route_status
  ON forecourt_jpl_service_messages(station_id, route_status, route_severity, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_service_route_key
  ON forecourt_jpl_service_messages(station_id, route_key, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_bor_processing_status
  ON forecourt_jpl_back_office_records(station_id, processing_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_bor_record_kind
  ON forecourt_jpl_back_office_records(station_id, record_kind, collected_at DESC);
