ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS doms_external_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS doms_ept_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS doms_ept_sequence_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_ept_receipt_format_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS doms_receipt_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_card_label TEXT,
  ADD COLUMN IF NOT EXISTS doms_card_pan_masked VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_unattended_receipt_json JSONB,
  ADD COLUMN IF NOT EXISTS doms_unattended_payment_json JSONB;

ALTER TABLE forecourt_transactions
  ADD COLUMN IF NOT EXISTS doms_external_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS doms_ept_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS doms_ept_sequence_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_ept_receipt_format_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS doms_receipt_no VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_card_label TEXT,
  ADD COLUMN IF NOT EXISTS doms_card_pan_masked VARCHAR(32),
  ADD COLUMN IF NOT EXISTS doms_unattended_receipt_json JSONB,
  ADD COLUMN IF NOT EXISTS doms_unattended_payment_json JSONB;

CREATE INDEX IF NOT EXISTS idx_transactions_doms_external_payment_ref
  ON transactions(station_id, doms_external_payment_reference)
  WHERE doms_external_payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_doms_ept_seq
  ON transactions(station_id, doms_ept_id, doms_ept_sequence_no)
  WHERE doms_ept_id IS NOT NULL OR doms_ept_sequence_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_doms_unattended_receipt
  ON transactions(station_id, doms_source_mode, doms_receipt_no)
  WHERE doms_source_system = 'jpl'
    AND doms_source_mode = 'unsupervised'
    AND doms_receipt_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forecourt_transactions_doms_external_payment_ref
  ON forecourt_transactions(station_id, doms_external_payment_reference)
  WHERE doms_external_payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forecourt_transactions_doms_ept_seq
  ON forecourt_transactions(station_id, doms_ept_id, doms_ept_sequence_no)
  WHERE doms_ept_id IS NOT NULL OR doms_ept_sequence_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forecourt_transactions_doms_receipt_no
  ON forecourt_transactions(station_id, doms_receipt_no)
  WHERE doms_receipt_no IS NOT NULL;
