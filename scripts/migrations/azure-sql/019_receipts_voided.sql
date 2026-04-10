-- Receipts Voided Columns - Azure SQL Migration
-- 019_receipts_voided.sql
-- Adds voided_at / voided_by to receipts so a credit note voids the original receipt.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = 'receipts' AND COLUMN_NAME = 'voided_at'
)
ALTER TABLE receipts ADD voided_at DATETIMEOFFSET NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = 'receipts' AND COLUMN_NAME = 'voided_by'
)
ALTER TABLE receipts ADD voided_by UNIQUEIDENTIFIER NULL
  REFERENCES users(id);
GO

CREATE INDEX idx_receipts_voided_at ON receipts(voided_at)
  WHERE voided_at IS NOT NULL;
GO
