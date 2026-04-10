-- Pre-release baseline reset: station configuration and admin/runtime support tables

CREATE TABLE IF NOT EXISTS branding_settings (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) UNIQUE,
    logo_path VARCHAR(500),
    primary_color VARCHAR(7) DEFAULT '#1a365d',
    secondary_color VARCHAR(7) DEFAULT '#2b6cb0',
    station_display_name VARCHAR(255),
    receipt_footer_text TEXT,
    receipt_header_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branding_station_id ON branding_settings(station_id);
CREATE INDEX IF NOT EXISTS idx_branding_updated_at ON branding_settings(updated_at);

CREATE TABLE IF NOT EXISTS station_settings (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) UNIQUE,
    linking_window_seconds INTEGER NOT NULL DEFAULT 30,
    key VARCHAR(255) NOT NULL UNIQUE,
    value_json JSONB,
    unallocated_handling VARCHAR(20) NOT NULL DEFAULT 'anonymous'
        CHECK (unallocated_handling IN ('anonymous', 'placeholder')),
    fiscalization_engine VARCHAR(10) NOT NULL DEFAULT 'mock'
        CHECK (fiscalization_engine IN ('TZ', 'KE', 'mock')),
    auto_fiscalize_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sync_time TIME DEFAULT '01:00:00',
    sync_timezone VARCHAR(50) DEFAULT 'Africa/Dar_es_Salaam',
    proxy_url TEXT,
    proxy_base_path TEXT NOT NULL DEFAULT '/proxy',
    vat_rate_tz NUMERIC,
    vat_rate_ke NUMERIC,
    vat_rate_default NUMERIC,
    volume_decimals INTEGER NOT NULL DEFAULT 2,
    money_decimals INTEGER NOT NULL DEFAULT 2,
    unit_price_decimals INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_volume_decimals CHECK (volume_decimals >= 0 AND volume_decimals <= 3),
    CONSTRAINT ck_money_decimals CHECK (money_decimals >= 0 AND money_decimals <= 3),
    CONSTRAINT ck_unit_price_decimals CHECK (unit_price_decimals >= 0 AND unit_price_decimals <= 3)
);

CREATE INDEX IF NOT EXISTS idx_station_settings_station_id ON station_settings(station_id);
CREATE INDEX IF NOT EXISTS idx_station_settings_updated_at ON station_settings(updated_at);
CREATE INDEX IF NOT EXISTS idx_station_settings_key ON station_settings(key);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    station_id UUID REFERENCES fuel_stations(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_station_id ON audit_logs(station_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) UNIQUE,
    last_push_at TIMESTAMPTZ,
    last_pull_at TIMESTAMPTZ,
    last_sync_status VARCHAR(20) CHECK (last_sync_status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    last_sync_error TEXT,
    records_pushed INTEGER DEFAULT 0,
    records_pulled INTEGER DEFAULT 0,
    conflicts_count INTEGER DEFAULT 0,
    sync_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_state_station_id ON sync_state(station_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at ON sync_state(updated_at);

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    local_data JSONB NOT NULL,
    cloud_data JSONB NOT NULL,
    local_updated_at TIMESTAMPTZ NOT NULL,
    cloud_updated_at TIMESTAMPTZ NOT NULL,
    resolution VARCHAR(20) CHECK (resolution IN ('LOCAL_WINS', 'CLOUD_WINS', 'MANUAL')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_station_id ON sync_conflicts(station_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity ON sync_conflicts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_created_at ON sync_conflicts(created_at);

CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY,
    station_id UUID REFERENCES fuel_stations(id),
    job_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled ON job_queue(scheduled_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue(job_type);
CREATE INDEX IF NOT EXISTS idx_job_queue_station_id ON job_queue(station_id);

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON rate_limits(window_end);

CREATE TABLE IF NOT EXISTS station_config (
    station_id UUID PRIMARY KEY REFERENCES fuel_stations(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL,
    config_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS station_config_versions (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL,
    config_json JSONB NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plugin_configs (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    process_type TEXT NOT NULL,
    plugin_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id, process_type, plugin_name)
);

CREATE TABLE IF NOT EXISTS device_configs (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    device_type TEXT NOT NULL,
    device_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id, device_type, device_key)
);

CREATE TABLE IF NOT EXISTS config_imports (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    source_path TEXT NOT NULL,
    source_checksum TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_station_config_updated_at ON station_config(updated_at);
CREATE INDEX IF NOT EXISTS idx_plugin_configs_station ON plugin_configs(station_id, process_type);
CREATE INDEX IF NOT EXISTS idx_device_configs_station ON device_configs(station_id, device_type);

CREATE TABLE IF NOT EXISTS fiscal_config (
    station_id UUID PRIMARY KEY REFERENCES fuel_stations(id) ON DELETE CASCADE,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fiscal_registration (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    registration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    registered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id)
);

CREATE TABLE IF NOT EXISTS fiscal_devices (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    device_type TEXT NOT NULL,
    device_key TEXT NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id, device_type, device_key)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_devices_station ON fiscal_devices(station_id, device_type);

CREATE TABLE IF NOT EXISTS ewura_config (
    station_id UUID PRIMARY KEY REFERENCES fuel_stations(id) ON DELETE CASCADE,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ewura_registration (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    registration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    registered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id)
);

CREATE TABLE IF NOT EXISTS station_kv (
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (station_id, key)
);

CREATE INDEX IF NOT EXISTS idx_station_kv_key ON station_kv(key);

CREATE TABLE IF NOT EXISTS process_catalog (
    process_type TEXT PRIMARY KEY,
    schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plugin_catalog (
    plugin_name TEXT PRIMARY KEY,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    schemas_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plugin_catalog_updated_at ON plugin_catalog(updated_at);

CREATE TABLE IF NOT EXISTS cfg_tax_types (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    rate NUMERIC,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cfg_product_class_codes (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cfg_product_type_codes (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cfg_credit_note_reasons (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cfg_pack_sizes (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cfg_units_of_measure (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS station_config_defaults (
    id UUID PRIMARY KEY,
    country TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (country, schema_version)
);

CREATE INDEX IF NOT EXISTS station_config_defaults_country_idx ON station_config_defaults(country);

CREATE TABLE IF NOT EXISTS plugin_config_versions (
    id BIGSERIAL PRIMARY KEY,
    station_id TEXT NOT NULL,
    process_type TEXT NOT NULL,
    plugin_name TEXT NOT NULL,
    schema_version INT NOT NULL DEFAULT 1,
    config_json JSONB NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plugin_config_versions_station_idx ON plugin_config_versions(station_id);
CREATE INDEX IF NOT EXISTS plugin_config_versions_lookup_idx ON plugin_config_versions(station_id, process_type, plugin_name, created_at DESC);

CREATE TABLE IF NOT EXISTS device_config_versions (
    id BIGSERIAL PRIMARY KEY,
    station_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    device_key TEXT NOT NULL,
    schema_version INT NOT NULL DEFAULT 1,
    config_json JSONB NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_config_versions_station_idx ON device_config_versions(station_id);
CREATE INDEX IF NOT EXISTS device_config_versions_lookup_idx ON device_config_versions(station_id, device_type, device_key, created_at DESC);

DROP TRIGGER IF EXISTS update_branding_settings_updated_at ON branding_settings;
CREATE TRIGGER update_branding_settings_updated_at BEFORE UPDATE ON branding_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_station_settings_updated_at ON station_settings;
CREATE TRIGGER update_station_settings_updated_at BEFORE UPDATE ON station_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sync_state_updated_at ON sync_state;
CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_job_queue_updated_at ON job_queue;
CREATE TRIGGER update_job_queue_updated_at BEFORE UPDATE ON job_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER update_rate_limits_updated_at BEFORE UPDATE ON rate_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_station_config_updated_at ON station_config;
CREATE TRIGGER update_station_config_updated_at BEFORE UPDATE ON station_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_plugin_configs_updated_at ON plugin_configs;
CREATE TRIGGER update_plugin_configs_updated_at BEFORE UPDATE ON plugin_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_device_configs_updated_at ON device_configs;
CREATE TRIGGER update_device_configs_updated_at BEFORE UPDATE ON device_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscal_config_updated_at ON fiscal_config;
CREATE TRIGGER update_fiscal_config_updated_at BEFORE UPDATE ON fiscal_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscal_registration_updated_at ON fiscal_registration;
CREATE TRIGGER update_fiscal_registration_updated_at BEFORE UPDATE ON fiscal_registration
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscal_devices_updated_at ON fiscal_devices;
CREATE TRIGGER update_fiscal_devices_updated_at BEFORE UPDATE ON fiscal_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ewura_config_updated_at ON ewura_config;
CREATE TRIGGER update_ewura_config_updated_at BEFORE UPDATE ON ewura_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ewura_registration_updated_at ON ewura_registration;
CREATE TRIGGER update_ewura_registration_updated_at BEFORE UPDATE ON ewura_registration
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_process_catalog_updated_at ON process_catalog;
CREATE TRIGGER update_process_catalog_updated_at BEFORE UPDATE ON process_catalog
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_plugin_catalog_updated_at ON plugin_catalog;
CREATE TRIGGER update_plugin_catalog_updated_at BEFORE UPDATE ON plugin_catalog
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
