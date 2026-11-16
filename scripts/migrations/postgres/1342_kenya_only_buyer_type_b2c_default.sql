-- Correct the historical all-country buyer-type default from migration 1341.
-- Leave 1341 unchanged for migration checksum compatibility.
ALTER TABLE customers ALTER COLUMN buyer_type DROP DEFAULT;

-- Restore exactly the non-Kenya NULL values captured before 1341 ran.
-- Explicit B2C classifications were never snapshotted and remain untouched.
-- If 1341 had already run before the snapshot migration was installed,
-- previously converted non-Kenya NULLs cannot be identified safely here.
UPDATE customers c
   SET buyer_type = NULL,
       updated_at = NOW()
  FROM migration_1341_non_kenya_null_buyer_types snapshot
 WHERE c.id = snapshot.customer_id
   AND c.buyer_type = 'B2C'
   AND UPPER(BTRIM(COALESCE(c.country, ''))) NOT IN ('KE', 'KEN', 'KENYA');

DROP TABLE migration_1341_non_kenya_null_buyer_types;

-- Kenya-only backfill for any still-null records.
UPDATE customers
   SET buyer_type = 'B2C',
       updated_at = NOW()
 WHERE buyer_type IS NULL
   AND UPPER(BTRIM(COALESCE(country, ''))) IN ('KE', 'KEN', 'KENYA');
