-- Backfill only Kenya customers with no buyer classification.
-- An explicit B2B/GOV/OTHER (or other) classification is never overwritten.
-- The customer country is authoritative when populated; for legacy records
-- with no customer country, use the home station's configured country.
-- Deliberately do not set a column-wide DEFAULT: customers is shared by
-- multiple countries and their existing NULL behavior must be retained.
UPDATE customers AS c
   SET buyer_type = 'B2C',
       updated_at = NOW()
 WHERE c.buyer_type IS NULL
   AND (
     UPPER(BTRIM(COALESCE(c.country, ''))) = 'KE'
     OR (
       NULLIF(BTRIM(c.country), '') IS NULL
       AND EXISTS (
         SELECT 1
           FROM fuel_stations AS fs
          WHERE fs.id = c.station_id
            AND UPPER(BTRIM(COALESCE(fs.country, ''))) = 'KE'
       )
     )
   );
