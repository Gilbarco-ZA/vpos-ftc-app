ALTER TABLE nozzles
  ADD COLUMN IF NOT EXISTS display_number INTEGER;

UPDATE nozzles
   SET display_number = nozzle_number
 WHERE display_number IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'nozzles_display_number_positive_check'
  ) THEN
    ALTER TABLE nozzles
      ADD CONSTRAINT nozzles_display_number_positive_check
      CHECK (display_number IS NULL OR display_number > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nozzles_active_display_number
  ON nozzles (station_id, pump_id, display_number)
  WHERE is_active = TRUE AND display_number IS NOT NULL;

COMMENT ON COLUMN nozzles.display_number IS
  'Human-readable nozzle label for operator-facing screens. Controller matching continues to use nozzle_number.';
