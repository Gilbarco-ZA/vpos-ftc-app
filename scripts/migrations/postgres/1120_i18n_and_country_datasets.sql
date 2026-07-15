-- Internationalization and country-scoped fiscal/catalog datasets

-- Allow future country datasets to use ISO alpha-2 or alpha-3 style country codes.
ALTER TABLE fuel_stations ALTER COLUMN country TYPE VARCHAR(3);
ALTER TABLE customers ALTER COLUMN address_country_code TYPE VARCHAR(3);

CREATE TABLE IF NOT EXISTS i18n_languages (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    native_name TEXT,
    direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_i18n_languages_single_default
    ON i18n_languages (is_default)
    WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_i18n_languages_active
    ON i18n_languages (is_active, sort_order, name);

CREATE TABLE IF NOT EXISTS i18n_messages (
    id UUID PRIMARY KEY,
    language_code TEXT NOT NULL REFERENCES i18n_languages(code) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'common',
    message_key TEXT NOT NULL,
    message_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (language_code, namespace, message_key)
);

CREATE INDEX IF NOT EXISTS idx_i18n_messages_lookup
    ON i18n_messages (language_code, namespace, message_key);

CREATE TABLE IF NOT EXISTS country_datasets (
    id UUID PRIMARY KEY,
    country_code TEXT NOT NULL UNIQUE,
    country_name TEXT NOT NULL,
    currency_code TEXT,
    timezone TEXT,
    default_language_code TEXT REFERENCES i18n_languages(code) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT,
    version INT NOT NULL DEFAULT 1,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_country_datasets_active
    ON country_datasets (is_active, country_name, country_code);

CREATE TABLE IF NOT EXISTS country_dataset_rows (
    id UUID PRIMARY KEY,
    country_code TEXT NOT NULL REFERENCES country_datasets(country_code) ON DELETE CASCADE,
    dataset_type TEXT NOT NULL CHECK (dataset_type IN (
        'taxTypes',
        'productClassCodes',
        'productTypeCodes',
        'creditNoteReasons',
        'packagingUnits',
        'quantityUnits'
    )),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    rate NUMERIC,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (country_code, dataset_type, code)
);

CREATE INDEX IF NOT EXISTS idx_country_dataset_rows_lookup
    ON country_dataset_rows (country_code, dataset_type, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_country_dataset_rows_code
    ON country_dataset_rows (dataset_type, code);

DROP TRIGGER IF EXISTS update_i18n_languages_updated_at ON i18n_languages;
CREATE TRIGGER update_i18n_languages_updated_at BEFORE UPDATE ON i18n_languages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_i18n_messages_updated_at ON i18n_messages;
CREATE TRIGGER update_i18n_messages_updated_at BEFORE UPDATE ON i18n_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_country_datasets_updated_at ON country_datasets;
CREATE TRIGGER update_country_datasets_updated_at BEFORE UPDATE ON country_datasets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_country_dataset_rows_updated_at ON country_dataset_rows;
CREATE TRIGGER update_country_dataset_rows_updated_at BEFORE UPDATE ON country_dataset_rows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
