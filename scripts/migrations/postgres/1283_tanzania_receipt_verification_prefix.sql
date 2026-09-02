-- Station-owned selection for Tanzania receipt verification number prefixes.
-- Development is the compatibility default for existing installations.

ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS tanzania_receipt_verification_prefix_mode VARCHAR(16) NOT NULL DEFAULT 'development',
  ADD COLUMN IF NOT EXISTS tanzania_receipt_verification_prefix_override VARCHAR(6);

ALTER TABLE station_settings
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_prefix_mode,
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_prefix_override,
  DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_prefix_manual;

ALTER TABLE station_settings
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_prefix_mode
    CHECK (
      tanzania_receipt_verification_prefix_mode IN (
        'development', 'production', 'manual'
      )
    ),
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_prefix_override
    CHECK (
      tanzania_receipt_verification_prefix_override IS NULL
      OR tanzania_receipt_verification_prefix_override ~ '^[A-Z0-9]{6}$'
    ),
  ADD CONSTRAINT ck_station_settings_tanzania_receipt_prefix_manual
    CHECK (
      tanzania_receipt_verification_prefix_mode <> 'manual'
      OR tanzania_receipt_verification_prefix_override IS NOT NULL
    );

COMMENT ON COLUMN station_settings.tanzania_receipt_verification_prefix_mode IS
  'Selects the built-in development/production receipt prefix or a manual override.';
COMMENT ON COLUMN station_settings.tanzania_receipt_verification_prefix_override IS
  'Six-character receipt verification prefix used only when mode is manual.';
