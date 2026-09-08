-- Tanzania receipt verification configuration.
-- The receipt prefix defaults to the receiptCode returned during device
-- registration. TRA verification URL selection is configured independently.

ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS tanzania_receipt_verification_url_mode VARCHAR(16) NOT NULL DEFAULT 'development',
  ADD COLUMN IF NOT EXISTS tanzania_receipt_verification_url_override TEXT;

-- Remove the legacy mode constraint before migrating existing values to the
-- new registered/manual model. The legacy constraint only permits
-- development/production/manual and would reject 'registered'.
ALTER TABLE station_settings
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_prefix_mode,
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_prefix_manual,
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_url_mode,
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_url_manual;

UPDATE station_settings
   SET tanzania_receipt_verification_prefix_mode = 'registered'
 WHERE tanzania_receipt_verification_prefix_mode IN ('development', 'production');

ALTER TABLE station_settings
  ALTER COLUMN tanzania_receipt_verification_prefix_mode SET DEFAULT 'registered';

ALTER TABLE station_settings
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_prefix_mode
    CHECK (tanzania_receipt_verification_prefix_mode IN ('registered', 'manual')),
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_prefix_manual
    CHECK (
      tanzania_receipt_verification_prefix_mode <> 'manual'
      OR tanzania_receipt_verification_prefix_override IS NOT NULL
    ),
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_url_mode
    CHECK (
      tanzania_receipt_verification_url_mode IN (
        'development', 'production', 'manual'
      )
    ),
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_url_manual
    CHECK (
      tanzania_receipt_verification_url_mode <> 'manual'
      OR NULLIF(BTRIM(tanzania_receipt_verification_url_override), '') IS NOT NULL
    );

COMMENT ON COLUMN station_settings.tanzania_receipt_verification_prefix_mode IS
  'Uses the registered device receiptCode by default, or a station-owned manual prefix override.';
COMMENT ON COLUMN station_settings.tanzania_receipt_verification_prefix_override IS
  'Six-character manual receipt verification prefix used only when prefix mode is manual.';
COMMENT ON COLUMN station_settings.tanzania_receipt_verification_url_mode IS
  'Selects the development, production, or manual TRA receipt verification URL used in receipt QR codes.';
COMMENT ON COLUMN station_settings.tanzania_receipt_verification_url_override IS
  'Manual TRA receipt verification base URL used only when URL mode is manual.';
