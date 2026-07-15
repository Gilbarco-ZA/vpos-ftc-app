-- TIN Capture System - Azure SQL Schema
-- FUEL STATIONS
CREATE TABLE fuel_stations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    code NVARCHAR(50) NOT NULL UNIQUE,
    name NVARCHAR(255) NOT NULL,
    address NVARCHAR(MAX),
    city NVARCHAR(100),
    country NVARCHAR(3) NOT NULL,
    phone NVARCHAR(50),
    email NVARCHAR(255),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    deleted_at DATETIMEOFFSET
);

CREATE INDEX idx_fuel_stations_code ON fuel_stations(code);
CREATE INDEX idx_fuel_stations_country ON fuel_stations(country);
CREATE INDEX idx_fuel_stations_updated_at ON fuel_stations(updated_at);

-- USERS
CREATE TABLE users (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id),
    username NVARCHAR(100) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('administrator', 'manager', 'tenant')),
    full_name NVARCHAR(255),
    is_active BIT NOT NULL DEFAULT 1,
    last_login_at DATETIMEOFFSET,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    deleted_at DATETIMEOFFSET,
    CONSTRAINT UQ_users_station_username UNIQUE(station_id, username),
    CONSTRAINT UQ_users_station_email UNIQUE(station_id, email)
);

CREATE INDEX idx_users_station_id ON users(station_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_updated_at ON users(updated_at);

-- CUSTOMERS (Master list)
CREATE TABLE customers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tin NVARCHAR(50) NOT NULL,
    trade_name NVARCHAR(255) NOT NULL,
    contact_name NVARCHAR(255),
    contact_number NVARCHAR(50),
    address_line_1 NVARCHAR(255),
    address_line_2 NVARCHAR(255),
    city NVARCHAR(100),
    country NVARCHAR(100),
    last_station_id UNIQUEIDENTIFIER NULL REFERENCES fuel_stations(id),
    last_seen_at DATETIMEOFFSET NULL,
    is_anonymous BIT NOT NULL DEFAULT 0,
    local_customer_id UNIQUEIDENTIFIER, -- tracking pointer to local
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    deleted_at DATETIMEOFFSET,
    CONSTRAINT UQ_customers_country_tin UNIQUE(country, tin)
);

CREATE INDEX idx_customers_tin ON customers(tin);
CREATE INDEX idx_customers_country_tin ON customers(country, tin);
CREATE INDEX idx_customers_trade_name ON customers(trade_name);
CREATE INDEX idx_customers_updated_at ON customers(updated_at);
CREATE INDEX idx_customers_last_station ON customers(last_station_id);

-- CUSTOMER ↔ STATION relationship
CREATE TABLE customer_stations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    customer_id UNIQUEIDENTIFIER NOT NULL REFERENCES customers(id),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id),
    first_seen_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    last_seen_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    is_preferred BIT NOT NULL DEFAULT 0,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT UQ_customer_stations UNIQUE(customer_id, station_id)
);

CREATE INDEX idx_customer_stations_customer ON customer_stations(customer_id);
CREATE INDEX idx_customer_stations_station ON customer_stations(station_id);
CREATE INDEX idx_customer_stations_last_seen ON customer_stations(station_id, last_seen_at DESC);

-- TRANSACTIONS
CREATE TABLE transactions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id),
    customer_id UNIQUEIDENTIFIER REFERENCES customers(id),
    pump_number INT NOT NULL,
    transaction_date_time DATETIMEOFFSET NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    volume DECIMAL(10, 3),
    fuel_type NVARCHAR(50),
    tank_id UNIQUEIDENTIFIER NULL,
    nozzle_id UNIQUEIDENTIFIER NULL,
    nozzle_number INT NULL,
    grade_id NVARCHAR(100) NULL,
    grade_name NVARCHAR(100) NULL,
    pos_reference NVARCHAR(100),
    status NVARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN',
        'ALLOCATED',
        'FISCALIZING',
        'FISCALIZED',
        'FAILED',
        'PRINTED',
        'REPRINTED'
    )),
    allocated_at DATETIMEOFFSET,
    allocated_by UNIQUEIDENTIFIER REFERENCES users(id),
    fiscalization_reference NVARCHAR(255),
    fiscalization_response NVARCHAR(MAX),
    fiscalized_at DATETIMEOFFSET,
    auto_fiscalized BIT NOT NULL DEFAULT 0,
    retry_count INT NOT NULL DEFAULT 0,
    last_error NVARCHAR(MAX),
    local_transaction_id UNIQUEIDENTIFIER, -- Reference to local transaction record
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    deleted_at DATETIMEOFFSET
);

CREATE INDEX idx_transactions_station_id ON transactions(station_id);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_transactions_pump_number ON transactions(pump_number);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_date ON transactions(transaction_date_time);
CREATE INDEX idx_transactions_pos_ref ON transactions(pos_reference);
CREATE INDEX idx_transactions_updated_at ON transactions(updated_at);

-- FISCALIZATION EVENTS
CREATE TABLE fiscalization_events (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id),
    transaction_id UNIQUEIDENTIFIER NOT NULL REFERENCES transactions(id),
    engine NVARCHAR(10) NOT NULL CHECK (engine IN ('TZ', 'KE', 'mock')),
    status NVARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    reference NVARCHAR(255),
    request_payload NVARCHAR(MAX),
    response_payload NVARCHAR(MAX),
    error_message NVARCHAR(MAX),
    occurred_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT CK_fisc_req_json CHECK (request_payload IS NULL OR ISJSON(request_payload) = 1),
    CONSTRAINT CK_fisc_res_json CHECK (response_payload IS NULL OR ISJSON(response_payload) = 1)
);

CREATE INDEX idx_fisc_events_station ON fiscalization_events(station_id);
CREATE INDEX idx_fisc_events_txn ON fiscalization_events(transaction_id);
CREATE INDEX idx_fisc_events_occurred ON fiscalization_events(occurred_at);
CREATE INDEX idx_fisc_events_status ON fiscalization_events(status);
CREATE INDEX idx_fisc_events_updated_at ON fiscalization_events(updated_at);

-- RECEIPTS
CREATE TABLE receipts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    transaction_id UNIQUEIDENTIFIER NOT NULL REFERENCES transactions(id),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id),
    receipt_number NVARCHAR(100) NOT NULL,
    html_content NVARCHAR(MAX) NOT NULL,
    plain_text_content NVARCHAR(MAX),
    fiscal_data NVARCHAR(MAX) NOT NULL, -- JSON string
    branding_snapshot NVARCHAR(MAX), -- JSON string
    generated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    local_receipt_id UNIQUEIDENTIFIER,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT CK_receipts_fiscal_data_json CHECK (ISJSON(fiscal_data) = 1),
    CONSTRAINT CK_receipts_branding_json CHECK (branding_snapshot IS NULL OR ISJSON(branding_snapshot) = 1)
);

CREATE INDEX idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX idx_receipts_station_id ON receipts(station_id);
CREATE INDEX idx_receipts_receipt_number ON receipts(receipt_number);
CREATE INDEX idx_receipts_updated_at ON receipts(updated_at);

-- STATION SETTINGS
CREATE TABLE station_settings (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id) UNIQUE,
    linking_window_seconds INT NOT NULL DEFAULT 30,
    unallocated_handling NVARCHAR(20) NOT NULL DEFAULT 'anonymous' 
        CHECK (unallocated_handling IN ('anonymous', 'placeholder')),
    fiscalization_engine NVARCHAR(10) NOT NULL DEFAULT 'mock'
        CHECK (fiscalization_engine IN ('TZ', 'KE', 'mock')),
    auto_fiscalize_enabled BIT NOT NULL DEFAULT 1,
    sync_enabled BIT NOT NULL DEFAULT 1,
    sync_time TIME DEFAULT '02:00:00',
    sync_timezone NVARCHAR(50) DEFAULT 'Africa/Dar_es_Salaam',
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE INDEX idx_station_settings_station_id ON station_settings(station_id);
CREATE INDEX idx_station_settings_updated_at ON station_settings(updated_at);

-- SYNC STATE
CREATE TABLE sync_state (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id) UNIQUE,
    last_push_at DATETIMEOFFSET,
    last_pull_at DATETIMEOFFSET,
    last_sync_status NVARCHAR(20) CHECK (last_sync_status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    last_sync_error NVARCHAR(MAX),
    records_pushed INT DEFAULT 0,
    records_pulled INT DEFAULT 0,
    conflicts_count INT DEFAULT 0,
    sync_in_progress BIT NOT NULL DEFAULT 0,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE INDEX idx_sync_state_station_id ON sync_state(station_id);
CREATE INDEX idx_sync_state_updated_at ON sync_state(updated_at);

-- SYNC CONFLICTS
CREATE TABLE sync_conflicts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    station_id UNIQUEIDENTIFIER NOT NULL REFERENCES fuel_stations(id),
    entity_type NVARCHAR(50) NOT NULL,
    entity_id UNIQUEIDENTIFIER NOT NULL,
    local_data NVARCHAR(MAX) NOT NULL, -- JSON string
    cloud_data NVARCHAR(MAX) NOT NULL, -- JSON string
    local_updated_at DATETIMEOFFSET NOT NULL,
    cloud_updated_at DATETIMEOFFSET NOT NULL,
    resolution NVARCHAR(20) CHECK (resolution IN ('LOCAL_WINS', 'CLOUD_WINS', 'MANUAL')),
    resolved_at DATETIMEOFFSET,
    resolved_by UNIQUEIDENTIFIER REFERENCES users(id),
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

CREATE INDEX idx_sync_conflicts_station_id ON sync_conflicts(station_id);
CREATE INDEX idx_sync_conflicts_entity ON sync_conflicts(entity_type, entity_id);
CREATE INDEX idx_sync_conflicts_created_at ON sync_conflicts(created_at);
