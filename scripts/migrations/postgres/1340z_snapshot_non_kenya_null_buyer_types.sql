-- Capture non-Kenya NULL classifications before historical migration 1341.
--
-- Migration 1341 has already been merged and must remain checksum-stable.
-- On installations that have not yet applied 1341, preserve the IDs of
-- non-Kenya customers that it would otherwise change.
-- On installations that already applied 1341, original NULL values cannot
-- be reconstructed from the current customer rows alone.
CREATE TABLE IF NOT EXISTS migration_1341_non_kenya_null_buyer_types (
  customer_id UUID PRIMARY KEY
);

INSERT INTO migration_1341_non_kenya_null_buyer_types (customer_id)
SELECT c.id
  FROM customers c
 WHERE c.buyer_type IS NULL
   AND UPPER(BTRIM(COALESCE(c.country, ''))) NOT IN ('KE', 'KEN', 'KENYA')
ON CONFLICT (customer_id) DO NOTHING;
