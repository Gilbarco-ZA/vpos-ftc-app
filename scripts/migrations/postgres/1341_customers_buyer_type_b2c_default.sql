-- Backfill missing buyer classification in customer records.
-- Existing explicit buyer types (B2B, GOV, OTHER, etc.) are unchanged.
-- This migration is safe to rerun and is applied by the normal bootstrap migrator.
UPDATE customers
   SET buyer_type = 'B2C',
       updated_at = NOW()
 WHERE buyer_type IS NULL;

-- Future inserts that omit buyer_type also default to B2C.
-- Explicit NULL writes are handled by application persistence; a column
-- DEFAULT alone does not override explicitly supplied NULL.
ALTER TABLE customers
  ALTER COLUMN buyer_type SET DEFAULT 'B2C';
