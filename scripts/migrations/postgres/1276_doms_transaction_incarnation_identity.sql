-- DOMS TransSeqNo is DEC4 and is reused after rollover and Master Reset.
-- Preserve the operational FP/sequence columns, but use a physical-transaction
-- incarnation identity for idempotent normalized transaction creation.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS doms_transaction_identity VARCHAR(160);

UPDATE transactions
   SET doms_transaction_identity = CONCAT(
     'sequence:',
     doms_source_mode,
     ':',
     doms_fp_id::text,
     ':',
     LPAD(doms_trans_seq_no::text, 4, '0')
   )
 WHERE doms_source_system = 'jpl'
   AND doms_transaction_identity IS NULL
   AND doms_source_mode IS NOT NULL
   AND doms_fp_id IS NOT NULL
   AND doms_trans_seq_no IS NOT NULL;

DROP INDEX IF EXISTS idx_transactions_jpl_recovery_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_jpl_identity_key
  ON transactions(station_id, doms_transaction_identity)
  WHERE doms_source_system = 'jpl'
    AND doms_transaction_identity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_jpl_sequence_lookup
  ON transactions(station_id, doms_source_mode, doms_fp_id, doms_trans_seq_no, doms_last_seen_at DESC)
  WHERE doms_source_system = 'jpl'
    AND doms_trans_seq_no IS NOT NULL
    AND doms_fp_id IS NOT NULL
    AND doms_source_mode IS NOT NULL;
