-- Phase 1B: bounded queue, inbox, audit, session and VPOS log retention.

ALTER TABLE fiscal_inbox
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_print_jobs_retention_done
  ON print_jobs (station_id, completed_at, id)
  WHERE status = 'DONE' AND completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_print_jobs_retention_failed
  ON print_jobs (station_id, completed_at, id)
  WHERE status = 'FAILED' AND completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transaction_queue_retention_done
  ON transaction_queue (station_id, updated_at, id)
  WHERE status = 'DONE';

CREATE INDEX IF NOT EXISTS idx_transaction_queue_retention_failed
  ON transaction_queue (station_id, updated_at, id)
  WHERE status = 'FAILED' AND next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_queue_retention_done
  ON report_queue (station_id, updated_at, id)
  WHERE status = 'DONE';

CREATE INDEX IF NOT EXISTS idx_report_queue_retention_failed
  ON report_queue (station_id, updated_at, id)
  WHERE status = 'FAILED' AND next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_retention_processed
  ON fiscal_inbox (station_id, processed_at, id)
  WHERE status = 'PROCESSED' AND processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_retention_resolved_dead
  ON fiscal_inbox (station_id, resolved_at, id)
  WHERE status = 'DEAD' AND resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_retention_station_created
  ON audit_logs (station_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_vpos_logs_retention_station_updated
  ON vpos_logs (station_id, updated_at, id);
