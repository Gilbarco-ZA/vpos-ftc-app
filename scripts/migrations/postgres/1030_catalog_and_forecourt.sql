-- Pre-release baseline reset: catalog and forecourt topology

CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    icon VARCHAR(24),
    image_path VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id, code),
    UNIQUE (station_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_station_id
    ON product_categories(station_id, is_active, sort_order, name);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    product_id VARCHAR(120) NOT NULL,
    product_code VARCHAR(120) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(120),
    barcode VARCHAR(120),
    unit_price NUMERIC(14, 2) NOT NULL,
    unit_cost NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.16,
    category VARCHAR(120),
    category_id UUID REFERENCES product_categories(id),
    unit_of_measure VARCHAR(30),
    unit_of_packaging VARCHAR(30),
    pack_size INTEGER,
    tax_code VARCHAR(30),
    commodity_code VARCHAR(120),
    hazardous_indicator BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_name VARCHAR(255) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    dev_flow_override VARCHAR(20),
    last_sync_status VARCHAR(20),
    last_sync_at TIMESTAMPTZ,
    last_sync_message TEXT,
    product_class_code VARCHAR(60),
    product_type_code VARCHAR(60),
    ext_product_id VARCHAR(64),
    ext_product_code VARCHAR(64),
    ext_product_class_code VARCHAR(32),
    ext_product_type_code VARCHAR(32),
    ext_description VARCHAR(255),
    ext_unit_of_measure VARCHAR(30),
    ext_unit_of_packaging VARCHAR(30),
    ext_unit_price NUMERIC,
    ext_currency VARCHAR(8),
    ext_tax_code VARCHAR(32),
    ext_hazardous_indicator BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (station_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_station_id ON products(station_id);
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(station_id, product_code);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_last_sync_status ON products(last_sync_status);
CREATE INDEX IF NOT EXISTS idx_products_class_code ON products(product_class_code);
CREATE INDEX IF NOT EXISTS idx_products_type_code ON products(product_type_code);
CREATE INDEX IF NOT EXISTS idx_products_unit_of_packaging ON products(unit_of_packaging);
CREATE INDEX IF NOT EXISTS idx_products_ext_product_id ON products(ext_product_id);
CREATE INDEX IF NOT EXISTS idx_products_ext_product_code ON products(ext_product_code);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_station_sync_status_updated ON products(station_id, last_sync_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_station_class_code ON products(station_id, product_class_code);
CREATE INDEX IF NOT EXISTS idx_products_station_name ON products(station_id, product_name);

CREATE TABLE IF NOT EXISTS product_price_slices (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    product_id VARCHAR(120) NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.16,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMPTZ,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_price_slices_product
        FOREIGN KEY (station_id, product_id)
        REFERENCES products(station_id, product_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_price_slices_station_product
    ON product_price_slices(station_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_price_slices_effective_from
    ON product_price_slices(station_id, product_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_product_price_slices_current
    ON product_price_slices(station_id, product_id)
    WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS tank_groups (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tank_groups_station_id ON tank_groups(station_id);

CREATE TABLE IF NOT EXISTS pumps (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    has_nozzle_selector BOOLEAN NOT NULL DEFAULT FALSE,
    pump_number INT NOT NULL,
    tank_group_id UUID REFERENCES tank_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, code),
    UNIQUE (station_id, pump_number)
);

CREATE INDEX IF NOT EXISTS idx_pumps_station_id ON pumps(station_id);
CREATE INDEX IF NOT EXISTS idx_pumps_status ON pumps(status);
CREATE INDEX IF NOT EXISTS idx_pumps_updated_at ON pumps(updated_at);
CREATE INDEX IF NOT EXISTS idx_pumps_tank_group_id ON pumps(tank_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pumps_pump_number_station ON pumps(station_id, pump_number);

CREATE TABLE IF NOT EXISTS tanks (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    capacity_litres DECIMAL(12, 3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    low_level_litres DECIMAL(12, 3),
    critical_level_litres DECIMAL(12, 3),
    tank_group_id UUID REFERENCES tank_groups(id) ON DELETE SET NULL,
    doms_tank_id VARCHAR(10),
    live_volume_litres DECIMAL(12, 3),
    live_volume_updated_at TIMESTAMPTZ,
    manual_volume_litres DECIMAL(12, 3),
    manual_volume_recorded_at TIMESTAMPTZ,
    manual_volume_recorded_by VARCHAR(255),
    last_tg_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tanks_station_id ON tanks(station_id);
CREATE INDEX IF NOT EXISTS idx_tanks_product_id ON tanks(product_id);
CREATE INDEX IF NOT EXISTS idx_tanks_status ON tanks(status);
CREATE INDEX IF NOT EXISTS idx_tanks_updated_at ON tanks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tanks_tank_group_id ON tanks(tank_group_id);

CREATE TABLE IF NOT EXISTS nozzles (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL,
    pump_id UUID NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
    tank_id UUID NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
    nozzle_number INT NOT NULL,
    tank_group_id UUID REFERENCES tank_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pump_id, nozzle_number)
);

CREATE INDEX IF NOT EXISTS idx_nozzles_station_id ON nozzles(station_id);
CREATE INDEX IF NOT EXISTS idx_nozzles_pump_id ON nozzles(pump_id);
CREATE INDEX IF NOT EXISTS idx_nozzles_tank_id ON nozzles(tank_id);
CREATE INDEX IF NOT EXISTS idx_nozzles_tank_group_id ON nozzles(tank_group_id);

DROP TRIGGER IF EXISTS update_product_categories_updated_at ON product_categories;
CREATE TRIGGER update_product_categories_updated_at BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_price_slices_updated_at ON product_price_slices;
CREATE TRIGGER update_product_price_slices_updated_at BEFORE UPDATE ON product_price_slices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tank_groups_updated_at ON tank_groups;
CREATE TRIGGER update_tank_groups_updated_at BEFORE UPDATE ON tank_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pumps_updated_at ON pumps;
CREATE TRIGGER update_pumps_updated_at BEFORE UPDATE ON pumps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tanks_updated_at ON tanks;
CREATE TRIGGER update_tanks_updated_at BEFORE UPDATE ON tanks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nozzles_updated_at ON nozzles;
CREATE TRIGGER update_nozzles_updated_at BEFORE UPDATE ON nozzles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
