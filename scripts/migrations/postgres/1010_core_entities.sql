-- Pre-release baseline reset: core entities

CREATE TABLE IF NOT EXISTS fuel_stations (
    id UUID PRIMARY KEY,
    code VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(2),
    phone VARCHAR(50),
    email VARCHAR(255),
    timezone VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    cloud_station_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fuel_stations_code ON fuel_stations(code);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_country ON fuel_stations(country);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_updated_at ON fuel_stations(updated_at);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('administrator', 'manager', 'tenant')),
    full_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    cloud_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    UNIQUE (station_id, username),
    UNIQUE (station_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_station_id ON users(station_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_token_expires_idx ON sessions(token, expires_at);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    last_station_id UUID REFERENCES fuel_stations(id),
    last_seen_at TIMESTAMPTZ,
    tin VARCHAR(50) NOT NULL,
    country VARCHAR(100),
    buyer_name VARCHAR(255) NOT NULL,
    buyer_type VARCHAR(45),
    pin VARCHAR(50),
    passport_number VARCHAR(45),
    business_name VARCHAR(255),
    tax_ninbrn VARCHAR(50),
    address_street VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(100),
    address_province VARCHAR(100),
    address_postal_code VARCHAR(20),
    address_country_code VARCHAR(2),
    contact_phone VARCHAR(50),
    contact_mobile VARCHAR(50),
    contact_fax VARCHAR(50),
    contact_email VARCHAR(255),
    contact_website VARCHAR(255),
    contact_person VARCHAR(255),
    odometer VARCHAR(50),
    vehicle_reg_nr VARCHAR(50),
    payment_type VARCHAR(20),
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    cloud_customer_id UUID,
    imported_from_cloud BOOLEAN NOT NULL DEFAULT FALSE,
    imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    UNIQUE (country, tin)
);

CREATE INDEX IF NOT EXISTS idx_customers_country_tin_unique ON customers(country, tin);
CREATE INDEX IF NOT EXISTS idx_customers_tin ON customers(tin);
CREATE INDEX IF NOT EXISTS idx_customers_buyer_name ON customers(buyer_name);
CREATE INDEX IF NOT EXISTS idx_customers_station_tin ON customers(last_station_id, tin);
CREATE INDEX IF NOT EXISTS idx_customers_station_buyer_name ON customers(last_station_id, buyer_name);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_cloud_id ON customers(cloud_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_last_station ON customers(last_station_id);
CREATE INDEX IF NOT EXISTS idx_customers_search ON customers USING gin(
    to_tsvector('english', coalesce(buyer_name, '') || ' ' || coalesce(tin, '') || ' ' || coalesce(country, ''))
);

CREATE TABLE IF NOT EXISTS customer_stations (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_stations_customer ON customer_stations(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_stations_station ON customer_stations(station_id);
CREATE INDEX IF NOT EXISTS idx_customer_stations_last_seen ON customer_stations(station_id, last_seen_at DESC);

DROP TRIGGER IF EXISTS update_fuel_stations_updated_at ON fuel_stations;
CREATE TRIGGER update_fuel_stations_updated_at BEFORE UPDATE ON fuel_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_stations_updated_at ON customer_stations;
CREATE TRIGGER update_customer_stations_updated_at BEFORE UPDATE ON customer_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
