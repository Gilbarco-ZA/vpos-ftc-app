-- Phase 5D: deployment-safe retirement support for obsolete generic storage.
--
-- This migration is intentionally non-destructive. It records explicit manual
-- retirement/compatibility-restore runs. The actual DROP statements are owned
-- by `npm run config:storage:retire` and execute only after a same-transaction
-- audit, maintenance acknowledgement, and backup reference.

CREATE TABLE IF NOT EXISTS config_storage_retirement_runs (
    id UUID PRIMARY KEY,
    retirement_key TEXT NOT NULL,
    action TEXT NOT NULL
        CHECK (action IN ('RETIRE', 'RESTORE_COMPATIBILITY')),
    status TEXT NOT NULL
        CHECK (status IN ('PREPARED', 'APPLIED', 'FAILED')),
    application_version TEXT NOT NULL,
    operator_name TEXT NOT NULL,
    backup_reference TEXT,
    maintenance_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    source_run_id UUID REFERENCES config_storage_retirement_runs(id),
    audit_before JSONB NOT NULL DEFAULT '{}'::jsonb,
    audit_after JSONB,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_config_storage_retirement_runs_key_created
    ON config_storage_retirement_runs(retirement_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_storage_retirement_runs_status
    ON config_storage_retirement_runs(status, created_at DESC);

COMMENT ON TABLE config_storage_retirement_runs IS
  'Operator audit trail for explicit legacy configuration storage retirement and compatibility-shell restoration. This table contains no retired business payloads.';

COMMENT ON COLUMN config_storage_retirement_runs.backup_reference IS
  'Operator-supplied identifier for the external database backup taken before destructive retirement.';

COMMENT ON COLUMN config_storage_retirement_runs.audit_before IS
  'Same-transaction configuration storage audit captured immediately before the action.';

COMMENT ON COLUMN config_storage_retirement_runs.audit_after IS
  'Same-transaction configuration storage audit captured immediately after the action.';
