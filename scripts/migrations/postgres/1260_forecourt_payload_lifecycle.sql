-- Phase 4A: explicit DOMS/JPL payload lifecycle and safe compaction markers.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS doms_normalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS doms_payload_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS doms_payload_clear_reason TEXT;

UPDATE transactions
   SET doms_normalized_at = COALESCE(doms_normalized_at, doms_reconciled_at, doms_last_seen_at, doms_first_seen_at)
 WHERE doms_source_system = 'jpl'
   AND doms_normalized_at IS NULL
   AND doms_fp_id IS NOT NULL
   AND doms_trans_seq_no IS NOT NULL;

ALTER TABLE forecourt_transactions
  ADD COLUMN IF NOT EXISTS source_mode VARCHAR(16),
  ADD COLUMN IF NOT EXISTS normalized_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_payload_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS raw_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_clear_reason TEXT;

UPDATE forecourt_transactions
   SET source_mode = CASE WHEN is_supported THEN 'supervised' ELSE 'unsupervised' END
 WHERE source_mode IS NULL;

UPDATE forecourt_transactions
   SET raw_payload_hash = md5(raw::text)
 WHERE raw_payload_hash IS NULL
   AND raw IS NOT NULL
   AND raw <> '{}'::jsonb;

UPDATE forecourt_transactions raw_tx
   SET normalized_transaction_id = txn.id,
       normalized_at = COALESCE(raw_tx.normalized_at, txn.doms_normalized_at, txn.doms_reconciled_at),
       reconciled_at = COALESCE(raw_tx.reconciled_at, txn.doms_reconciled_at)
  FROM transactions txn
 WHERE raw_tx.station_id = txn.station_id
   AND txn.doms_source_system = 'jpl'
   AND raw_tx.source_mode = txn.doms_source_mode
   AND raw_tx.fp_id = txn.doms_fp_id
   AND raw_tx.trans_seq_no = txn.doms_trans_seq_no
   AND raw_tx.normalized_transaction_id IS NULL;

ALTER TABLE forecourt_jpl_transaction_checkpoints
  ADD COLUMN IF NOT EXISTS normalized_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload_clear_reason TEXT;

UPDATE forecourt_jpl_transaction_checkpoints checkpoint
   SET normalized_transaction_id = txn.id,
       reconciled_at = COALESCE(checkpoint.reconciled_at, txn.doms_reconciled_at)
  FROM transactions txn
 WHERE checkpoint.station_id = txn.station_id
   AND txn.doms_source_system = 'jpl'
   AND checkpoint.source_mode = txn.doms_source_mode
   AND checkpoint.fp_id = txn.doms_fp_id
   AND checkpoint.trans_seq_no = txn.doms_trans_seq_no
   AND checkpoint.normalized_transaction_id IS NULL;

ALTER TABLE forecourt_jpl_supervised_replay
  ADD COLUMN IF NOT EXISTS normalized_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload_clear_reason TEXT;

UPDATE forecourt_jpl_supervised_replay replay
   SET normalized_transaction_id = txn.id
  FROM transactions txn
 WHERE replay.station_id = txn.station_id
   AND txn.doms_source_system = 'jpl'
   AND txn.doms_source_mode = 'supervised'
   AND replay.fp_id = txn.doms_fp_id
   AND replay.trans_seq_no = txn.doms_trans_seq_no
   AND replay.normalized_transaction_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_doms_payload_compaction
  ON transactions(station_id, doms_cleared_at, id)
  WHERE doms_source_system = 'jpl'
    AND doms_payload_json IS NOT NULL
    AND doms_payload_cleared_at IS NULL
    AND doms_normalized_at IS NOT NULL
    AND doms_reconciled_at IS NOT NULL
    AND doms_cleared_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forecourt_transactions_raw_compaction
  ON forecourt_transactions(station_id, normalized_transaction_id, occurred_at, id)
  WHERE raw_cleared_at IS NULL
    AND raw <> '{}'::jsonb
    AND normalized_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jpl_checkpoint_payload_compaction
  ON forecourt_jpl_transaction_checkpoints(station_id, last_success_at, source_mode, fp_id, trans_seq_no)
  WHERE lifecycle_stage = 'cleared'
    AND blocked_by_foreign_pos = FALSE
    AND payload_cleared_at IS NULL
    AND (read_payload_json IS NOT NULL OR clear_payload_json IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_jpl_supervised_replay_payload_compaction
  ON forecourt_jpl_supervised_replay(station_id, cleared_at, fp_id, trans_seq_no)
  WHERE replay_stage = 'cleared'
    AND payload_cleared_at IS NULL
    AND (read_payload_json IS NOT NULL OR clear_fields_json IS NOT NULL);
