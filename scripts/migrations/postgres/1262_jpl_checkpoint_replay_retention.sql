-- Phase 4C: consolidate JPL recovery payload ownership and bound terminal rows.

ALTER TABLE forecourt_jpl_transaction_checkpoints
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_outcome VARCHAR(32);

ALTER TABLE forecourt_jpl_supervised_replay
  ADD COLUMN IF NOT EXISTS payload_owner VARCHAR(24) NOT NULL DEFAULT 'checkpoint',
  ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_outcome VARCHAR(32);

-- The checkpoint table is the sole temporary recovery-payload owner. Copy any
-- legacy supervised replay payload into its matching checkpoint without
-- replacing a payload already captured by the checkpoint workflow.
INSERT INTO forecourt_jpl_transaction_checkpoints (
  station_id,
  source_mode,
  fp_id,
  trans_seq_no,
  lifecycle_stage,
  lock_id,
  owner_pos_id,
  blocked_by_foreign_pos,
  read_attempts,
  clear_attempts,
  first_seen_at,
  last_attempt_at,
  last_success_at,
  read_payload_json,
  clear_payload_json,
  normalized_transaction_id,
  reconciled_at,
  last_error,
  updated_at
)
SELECT
  replay.station_id,
  'supervised',
  replay.fp_id,
  replay.trans_seq_no,
  CASE replay.replay_stage
    WHEN 'cleared' THEN 'cleared'
    WHEN 'captured' THEN 'captured'
    WHEN 'read_locked' THEN 'read_locked'
    ELSE 'discovered'
  END,
  replay.lock_id,
  replay.lock_id,
  FALSE,
  CASE WHEN replay.read_payload_json IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN replay.replay_stage = 'cleared' THEN 1 ELSE 0 END,
  COALESCE(replay.captured_at, replay.updated_at, NOW()),
  replay.updated_at,
  COALESCE(replay.cleared_at, replay.captured_at),
  replay.read_payload_json,
  replay.clear_fields_json,
  replay.normalized_transaction_id,
  txn.doms_reconciled_at,
  replay.last_error,
  replay.updated_at
FROM forecourt_jpl_supervised_replay replay
LEFT JOIN transactions txn
  ON txn.id = replay.normalized_transaction_id
 AND txn.station_id = replay.station_id
WHERE replay.read_payload_json IS NOT NULL
   OR replay.clear_fields_json IS NOT NULL
ON CONFLICT (station_id, source_mode, fp_id, trans_seq_no)
DO UPDATE SET
  read_payload_json = COALESCE(
    forecourt_jpl_transaction_checkpoints.read_payload_json,
    EXCLUDED.read_payload_json
  ),
  clear_payload_json = COALESCE(
    forecourt_jpl_transaction_checkpoints.clear_payload_json,
    EXCLUDED.clear_payload_json
  ),
  normalized_transaction_id = COALESCE(
    forecourt_jpl_transaction_checkpoints.normalized_transaction_id,
    EXCLUDED.normalized_transaction_id
  ),
  reconciled_at = COALESCE(
    forecourt_jpl_transaction_checkpoints.reconciled_at,
    EXCLUDED.reconciled_at
  ),
  payload_cleared_at = CASE
    WHEN (
      forecourt_jpl_transaction_checkpoints.read_payload_json IS NULL
      AND EXCLUDED.read_payload_json IS NOT NULL
    ) OR (
      forecourt_jpl_transaction_checkpoints.clear_payload_json IS NULL
      AND EXCLUDED.clear_payload_json IS NOT NULL
    ) THEN NULL
    ELSE forecourt_jpl_transaction_checkpoints.payload_cleared_at
  END,
  payload_clear_reason = CASE
    WHEN (
      forecourt_jpl_transaction_checkpoints.read_payload_json IS NULL
      AND EXCLUDED.read_payload_json IS NOT NULL
    ) OR (
      forecourt_jpl_transaction_checkpoints.clear_payload_json IS NULL
      AND EXCLUDED.clear_payload_json IS NOT NULL
    ) THEN NULL
    ELSE forecourt_jpl_transaction_checkpoints.payload_clear_reason
  END,
  updated_at = GREATEST(
    forecourt_jpl_transaction_checkpoints.updated_at,
    EXCLUDED.updated_at
  );

UPDATE forecourt_jpl_supervised_replay replay
   SET payload_owner = CASE
         WHEN checkpoint.station_id IS NOT NULL THEN 'checkpoint'
         WHEN replay.read_payload_json IS NOT NULL OR replay.clear_fields_json IS NOT NULL
           THEN 'legacy_replay'
         ELSE 'cleared'
       END
  FROM forecourt_jpl_transaction_checkpoints checkpoint
 WHERE checkpoint.station_id = replay.station_id
   AND checkpoint.source_mode = 'supervised'
   AND checkpoint.fp_id = replay.fp_id
   AND checkpoint.trans_seq_no = replay.trans_seq_no;

UPDATE forecourt_jpl_supervised_replay replay
   SET payload_owner = 'legacy_replay'
 WHERE (replay.read_payload_json IS NOT NULL OR replay.clear_fields_json IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1
       FROM forecourt_jpl_transaction_checkpoints checkpoint
      WHERE checkpoint.station_id = replay.station_id
        AND checkpoint.source_mode = 'supervised'
        AND checkpoint.fp_id = replay.fp_id
        AND checkpoint.trans_seq_no = replay.trans_seq_no
   );

UPDATE forecourt_jpl_transaction_checkpoints
   SET terminal_at = COALESCE(terminal_at, last_success_at, updated_at),
       terminal_outcome = COALESCE(terminal_outcome, 'cleared')
 WHERE lifecycle_stage = 'cleared';

UPDATE forecourt_jpl_supervised_replay
   SET terminal_at = COALESCE(terminal_at, cleared_at, updated_at),
       terminal_outcome = COALESCE(terminal_outcome, 'cleared')
 WHERE replay_stage = 'cleared';

CREATE INDEX IF NOT EXISTS idx_jpl_checkpoint_terminal_retention
  ON forecourt_jpl_transaction_checkpoints(
    station_id,
    terminal_at,
    source_mode,
    fp_id,
    trans_seq_no
  )
  WHERE lifecycle_stage = 'cleared'
    AND terminal_at IS NOT NULL
    AND payload_cleared_at IS NOT NULL
    AND read_payload_json IS NULL
    AND clear_payload_json IS NULL
    AND blocked_by_foreign_pos = FALSE
    AND last_error IS NULL;

CREATE INDEX IF NOT EXISTS idx_jpl_replay_terminal_retention
  ON forecourt_jpl_supervised_replay(
    station_id,
    terminal_at,
    fp_id,
    trans_seq_no
  )
  WHERE replay_stage = 'cleared'
    AND terminal_at IS NOT NULL
    AND payload_cleared_at IS NOT NULL
    AND read_payload_json IS NULL
    AND clear_fields_json IS NULL
    AND last_error IS NULL;

CREATE INDEX IF NOT EXISTS idx_jpl_replay_payload_consolidation
  ON forecourt_jpl_supervised_replay(station_id, updated_at, fp_id, trans_seq_no)
  WHERE payload_owner = 'checkpoint'
    AND payload_cleared_at IS NULL
    AND (read_payload_json IS NOT NULL OR clear_fields_json IS NOT NULL);
