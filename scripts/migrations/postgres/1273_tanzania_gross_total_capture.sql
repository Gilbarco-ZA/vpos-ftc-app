-- Track explicit administrator confirmation of the Tanzania lifetime
-- grossTotal opening balance. A saved value of 0 is a valid confirmed baseline.

ALTER TABLE station_settings
    ADD COLUMN IF NOT EXISTS tanzania_gross_total_opening_captured_at TIMESTAMPTZ;

-- Existing non-zero balances were necessarily entered intentionally before
-- the capture marker existed. Zero remains unconfirmed until an administrator
-- explicitly saves it for a new station.
UPDATE station_settings
   SET tanzania_gross_total_opening_captured_at = COALESCE(updated_at, NOW())
 WHERE tanzania_gross_total_opening <> 0
   AND tanzania_gross_total_opening_captured_at IS NULL;
