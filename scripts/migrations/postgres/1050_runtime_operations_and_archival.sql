-- Pre-release baseline reset: queues, runtime operations, observability and archival

CREATE TABLE IF NOT EXISTS transaction_queue (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NULL,
  last_error TEXT,
  processing_started_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_queue_station_status ON transaction_queue(station_id, status);
CREATE INDEX IF NOT EXISTS idx_transaction_queue_next_attempt ON transaction_queue(station_id, status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_queue_station_transaction_id
  ON transaction_queue (station_id, transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS report_queue (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NULL,
  last_error TEXT,
  processing_started_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_queue_station_status ON report_queue(station_id, status);
CREATE INDEX IF NOT EXISTS idx_report_queue_next_attempt ON report_queue(station_id, status, next_attempt_at);

CREATE TABLE IF NOT EXISTS print_jobs (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING',
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    error TEXT,
    processed_at TIMESTAMP NULL,
    idempotency_key TEXT,
    source_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    source_report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_pending ON print_jobs(station_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_print_jobs_station_idempotency_key ON print_jobs(station_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_print_jobs_source_transaction_id ON print_jobs(source_transaction_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_source_report_id ON print_jobs(source_report_id);

CREATE TABLE IF NOT EXISTS pos_commands (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    command TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENT', 'COMPLETED', 'FAILED')),
    requested_by UUID REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_commands_station ON pos_commands(station_id, status);

CREATE TABLE IF NOT EXISTS pos_command_results (
    id UUID PRIMARY KEY,
    command_id UUID NOT NULL REFERENCES pos_commands(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_command_results_command ON pos_command_results(command_id);

CREATE TABLE IF NOT EXISTS process_control_events (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_process TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    requested_by UUID REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_process_control_station ON process_control_events(station_id, status);

CREATE TABLE IF NOT EXISTS health_checks (
    id UUID PRIMARY KEY,
    station_id UUID REFERENCES fuel_stations(id) ON DELETE CASCADE,
    component TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_checks_station ON health_checks(station_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS vpos_logs (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('live','archive','restart')),
  filename TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(station_id, type, filename)
);

CREATE INDEX IF NOT EXISTS idx_vpos_logs_station_type_created
  ON vpos_logs(station_id, type, created_at DESC);

CREATE TABLE IF NOT EXISTS legacy_import_ledger (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id),
  import_run_id TEXT,
  source_type VARCHAR(32) NOT NULL,
  source_path TEXT NOT NULL,
  relative_path TEXT,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_mtime TIMESTAMP,
  sha256 CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('imported', 'skipped', 'failed')),
  error_message TEXT,
  moved_to_path TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_legacy_import_ledger_station_hash ON legacy_import_ledger(station_id, sha256, file_size);
CREATE INDEX IF NOT EXISTS idx_legacy_import_ledger_station_status ON legacy_import_ledger(station_id, status);
CREATE INDEX IF NOT EXISTS idx_legacy_import_ledger_station_updated ON legacy_import_ledger(station_id, updated_at);

CREATE TABLE IF NOT EXISTS station_daily_totals (
  station_id UUID NOT NULL REFERENCES fuel_stations(id),
  business_date DATE NOT NULL,
  tx_count INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_volume NUMERIC(14,3) NOT NULL DEFAULT 0,
  totals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (station_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_station_daily_totals_station_date ON station_daily_totals(station_id, business_date);

CREATE TABLE IF NOT EXISTS process_heartbeats (
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    process_name TEXT NOT NULL,
    pid INTEGER,
    status TEXT NOT NULL DEFAULT 'unknown',
    connected BOOLEAN NOT NULL DEFAULT FALSE,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT,
    restart_count INTEGER NOT NULL DEFAULT 0,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (station_id, process_name)
);

CREATE INDEX IF NOT EXISTS idx_process_heartbeats_station ON process_heartbeats(station_id, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_heartbeats_process ON process_heartbeats(process_name, last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS secure_artifacts (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    artifact_key TEXT NOT NULL,
    enc_alg TEXT NOT NULL DEFAULT 'AES-256-GCM',
    enc_version INTEGER NOT NULL DEFAULT 1,
    key_id TEXT,
    iv BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    ciphertext BYTEA NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rotated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    UNIQUE (station_id, artifact_type, artifact_key, rotated_at)
);

CREATE INDEX IF NOT EXISTS idx_secure_artifacts_station ON secure_artifacts(station_id, artifact_type);
CREATE INDEX IF NOT EXISTS idx_secure_artifacts_active
    ON secure_artifacts(station_id, artifact_type, artifact_key)
    WHERE rotated_at IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fiscal_inbox (
  id BIGSERIAL PRIMARY KEY,
  station_id TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'fiscal',
  request_id TEXT,
  message_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error_text TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dead_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_inbox_station_topic_request_idx
  ON fiscal_inbox (station_id, topic, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_inbox_station_status_received_idx ON fiscal_inbox(station_id, status, received_at);
CREATE INDEX IF NOT EXISTS fiscal_inbox_ready_idx ON fiscal_inbox(status, next_attempt_at, received_at, id);
CREATE INDEX IF NOT EXISTS fiscal_inbox_dead_idx ON fiscal_inbox(station_id, dead_at) WHERE status = 'DEAD';
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_station_status_next_attempt
  ON fiscal_inbox (station_id, status, next_attempt_at, id DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_station_request_lookup
  ON fiscal_inbox (station_id, request_id, id DESC)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_station_topic_received
  ON fiscal_inbox (station_id, topic, received_at DESC);

CREATE TABLE IF NOT EXISTS archive_events (
  id BIGSERIAL PRIMARY KEY,
  station_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  message_type TEXT NOT NULL,
  request_id TEXT,
  source TEXT,
  message_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS archive_events_station_created_idx ON archive_events(station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS archive_events_station_topic_created_idx ON archive_events(station_id, topic, created_at DESC);

CREATE TABLE IF NOT EXISTS archive_export_destinations (
  id BIGSERIAL PRIMARY KEY,
  station_id TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS archive_export_destinations_station_idx ON archive_export_destinations(station_id);

CREATE TABLE IF NOT EXISTS archive_exports (
  id BIGSERIAL PRIMARY KEY,
  station_id TEXT NOT NULL,
  destination_id BIGINT NOT NULL REFERENCES archive_export_destinations(id) ON DELETE CASCADE,
  from_event_id BIGINT,
  to_event_id BIGINT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS archive_exports_station_status_sched_idx ON archive_exports(station_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS archive_export_attempts (
  id BIGSERIAL PRIMARY KEY,
  export_id BIGINT NOT NULL REFERENCES archive_exports(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTED',
  error_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS archive_export_attempts_export_attempt_idx ON archive_export_attempts(export_id, attempt_no);

CREATE TABLE IF NOT EXISTS forecourt_events (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  apc TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS forecourt_events_station_time_idx ON forecourt_events(station_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS forecourt_state (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  fp_id INTEGER NOT NULL,
  status TEXT,
  last_event_id UUID REFERENCES forecourt_events(id) ON DELETE SET NULL,
  last_event_type TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, fp_id)
);

CREATE INDEX IF NOT EXISTS forecourt_state_station_idx ON forecourt_state(station_id);

CREATE TABLE IF NOT EXISTS forecourt_price_sets (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  price_set_id INTEGER NOT NULL,
  effective_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, price_set_id)
);

CREATE TABLE IF NOT EXISTS forecourt_prices (
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  price_set_id INTEGER NOT NULL,
  price_group_id INTEGER NOT NULL,
  grade_id INTEGER NOT NULL,
  price NUMERIC(18,6),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, price_set_id, price_group_id, grade_id),
  CONSTRAINT fk_forecourt_prices_price_set
    FOREIGN KEY (station_id, price_set_id)
    REFERENCES forecourt_price_sets(station_id, price_set_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forecourt_transactions (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  fp_id INTEGER,
  is_supported BOOLEAN NOT NULL DEFAULT TRUE,
  trans_seq_no BIGINT,
  sm_id BIGINT,
  trans_lock_id BIGINT,
  trans_info_mask BIGINT,
  money_due NUMERIC(18,6),
  volume NUMERIC(18,6),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_forecourt_tx_station_time ON forecourt_transactions(station_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_tx_station_fp_time ON forecourt_transactions(station_id, fp_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS forecourt_jpl_supervised_replay (
  station_id UUID NOT NULL,
  fp_id INTEGER NOT NULL,
  trans_seq_no INTEGER NOT NULL,
  replay_stage VARCHAR(32) NOT NULL DEFAULT 'discovered',
  lock_id VARCHAR(100),
  read_payload_json JSONB,
  clear_fields_json JSONB,
  captured_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (station_id, fp_id, trans_seq_no)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_jpl_supervised_replay_stage ON forecourt_jpl_supervised_replay(replay_stage, updated_at);

DROP TRIGGER IF EXISTS update_print_jobs_updated_at ON print_jobs;
CREATE TRIGGER update_print_jobs_updated_at BEFORE UPDATE ON print_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pos_commands_updated_at ON pos_commands;
CREATE TRIGGER update_pos_commands_updated_at BEFORE UPDATE ON pos_commands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pos_command_results_updated_at ON pos_command_results;
CREATE TRIGGER update_pos_command_results_updated_at BEFORE UPDATE ON pos_command_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_process_control_events_updated_at ON process_control_events;
CREATE TRIGGER update_process_control_events_updated_at BEFORE UPDATE ON process_control_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_legacy_import_ledger_updated_at ON legacy_import_ledger;
CREATE TRIGGER update_legacy_import_ledger_updated_at BEFORE UPDATE ON legacy_import_ledger
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_process_heartbeats_updated_at ON process_heartbeats;
CREATE TRIGGER update_process_heartbeats_updated_at BEFORE UPDATE ON process_heartbeats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_archive_export_destinations_updated_at ON archive_export_destinations;
CREATE TRIGGER update_archive_export_destinations_updated_at BEFORE UPDATE ON archive_export_destinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_archive_exports_updated_at ON archive_exports;
CREATE TRIGGER update_archive_exports_updated_at BEFORE UPDATE ON archive_exports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
