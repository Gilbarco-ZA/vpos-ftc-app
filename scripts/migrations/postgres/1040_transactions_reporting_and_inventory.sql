-- Pre-release baseline reset: transactions, documents, reporting and inventory ledger

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    customer_id UUID REFERENCES customers(id),
    pump_number INTEGER NOT NULL,
    transaction_date_time TIMESTAMPTZ NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    volume DECIMAL(10, 3),
    fuel_type VARCHAR(50),
    pos_reference VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN',
        'ALLOCATED',
        'PENDING',
        'FISCALIZING',
        'FISCALIZED',
        'FAILED',
        'PRINTED',
        'REPRINTED',
        'CREDITED'
    )),
    allocated_at TIMESTAMPTZ,
    allocated_by UUID REFERENCES users(id),
    fiscalization_reference VARCHAR(255),
    fiscalization_response TEXT,
    fiscalized_at TIMESTAMPTZ,
    linking_window_expires_at TIMESTAMPTZ,
    auto_fiscalized BOOLEAN NOT NULL DEFAULT FALSE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    cloud_transaction_id UUID,
    source_queue_id UUID,
    fiscal_queue_enqueued_at TIMESTAMPTZ,
    tank_id UUID REFERENCES tanks(id),
    nozzle_id UUID REFERENCES nozzles(id),
    nozzle_number INTEGER,
    grade_id VARCHAR(100),
    grade_name VARCHAR(100),
    odometer VARCHAR(50),
    payment_type VARCHAR(20),
    vehicle_reg_nr VARCHAR(50),
    fiscal_document_id TEXT,
    doms_source_system VARCHAR(20),
    doms_source_mode VARCHAR(20),
    doms_fp_id INTEGER,
    doms_trans_seq_no INTEGER,
    doms_trans_lock_id VARCHAR(100),
    doms_payload_json JSONB,
    doms_payload_hash VARCHAR(64),
    doms_first_seen_at TIMESTAMPTZ,
    doms_last_seen_at TIMESTAMPTZ,
    doms_cleared_at TIMESTAMPTZ,
    doms_reconciled_at TIMESTAMPTZ,
    legacy_filename TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT transactions_station_pos_reference_uniq UNIQUE (station_id, pos_reference)
);

CREATE INDEX IF NOT EXISTS idx_transactions_station_id ON transactions(station_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_pump_number ON transactions(pump_number);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date_time);
CREATE INDEX IF NOT EXISTS idx_transactions_pos_ref ON transactions(pos_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON transactions(updated_at);
CREATE INDEX IF NOT EXISTS idx_transactions_linking_window ON transactions(linking_window_expires_at) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_transactions_station_legacy_filename ON transactions(station_id, legacy_filename);
CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_source_queue_id ON transactions(source_queue_id) WHERE source_queue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tank_id ON transactions(tank_id);
CREATE INDEX IF NOT EXISTS idx_transactions_nozzle_id ON transactions(nozzle_id);
CREATE INDEX IF NOT EXISTS idx_transactions_grade_id ON transactions(grade_id);
CREATE INDEX IF NOT EXISTS idx_transactions_station_payment_type ON transactions(station_id, payment_type);
CREATE INDEX IF NOT EXISTS idx_transactions_station_status_enqueued ON transactions(station_id, status, fiscal_queue_enqueued_at);
CREATE INDEX IF NOT EXISTS idx_transactions_station_linking_expires ON transactions(station_id, linking_window_expires_at);
CREATE INDEX IF NOT EXISTS idx_transactions_doms_seq ON transactions(station_id, doms_source_mode, doms_fp_id, doms_trans_seq_no);
CREATE INDEX IF NOT EXISTS idx_transactions_doms_last_seen ON transactions(doms_last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_jpl_recovery_key
  ON transactions(station_id, doms_source_mode, doms_fp_id, doms_trans_seq_no)
  WHERE doms_source_system = 'jpl'
    AND doms_trans_seq_no IS NOT NULL
    AND doms_fp_id IS NOT NULL
    AND doms_source_mode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_station_status_date_active
  ON transactions (station_id, status, transaction_date_time DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_station_customer_date_active
  ON transactions (station_id, customer_id, transaction_date_time DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_station_fiscalized_at
  ON transactions (station_id, fiscalized_at DESC)
  WHERE fiscalized_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS fiscalization_events (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    engine VARCHAR(10) NOT NULL CHECK (engine IN ('TZ', 'KE', 'mock')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    reference VARCHAR(255),
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fisc_events_station ON fiscalization_events(station_id);
CREATE INDEX IF NOT EXISTS idx_fisc_events_txn ON fiscalization_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fisc_events_occurred ON fiscalization_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_fisc_events_status ON fiscalization_events(status);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    station_id UUID NOT NULL REFERENCES fuel_stations(id),
    receipt_number VARCHAR(100) NOT NULL,
    html_content TEXT NOT NULL,
    plain_text_content TEXT,
    fiscal_data JSONB NOT NULL,
    branding_snapshot JSONB,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cloud_receipt_id UUID,
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_station_id ON receipts(station_id);
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_number ON receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_receipts_updated_at ON receipts(updated_at);
CREATE INDEX IF NOT EXISTS idx_receipts_voided_at ON receipts(voided_at) WHERE voided_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  report_date_time TIMESTAMP NOT NULL DEFAULT NOW(),
  report_type TEXT NOT NULL DEFAULT 'UNKNOWN',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('COMPLETED', 'FAILED', 'PENDING')),
  legacy_filename TEXT,
  source_queue_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_station_time ON reports(station_id, report_date_time DESC);
CREATE INDEX IF NOT EXISTS idx_reports_station_legacy_filename ON reports(station_id, legacy_filename);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_source_queue_id
  ON reports(station_id, source_queue_id)
  WHERE source_queue_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transaction_lines (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(10, 3) NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    price_slice_id UUID REFERENCES product_price_slices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transaction_lines_transaction_id ON transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_product_id ON transaction_lines(product_id);

CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reason_code TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  proxy_response JSONB,
  last_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_station_created ON credit_notes(station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_notes_transaction ON credit_notes(transaction_id);

CREATE TABLE IF NOT EXISTS ewura_transactions (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    ewura_reference TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ewura_transactions_station ON ewura_transactions(station_id);

CREATE TABLE IF NOT EXISTS ewura_reports (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    report_date DATE,
    ewura_reference TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ewura_reports_station ON ewura_reports(station_id);

CREATE TABLE IF NOT EXISTS tank_inventory_ledger (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    tank_id UUID NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(20) NOT NULL
        CHECK (movement_type IN ('STOCK_IN', 'DEDUCTION')),
    stock_in_type VARCHAR(20)
        CHECK (stock_in_type IN ('StockCount', 'Delivery')),
    document_id VARCHAR(120) NOT NULL,
    quantity_litres NUMERIC(12, 3) NOT NULL CHECK (quantity_litres > 0),
    unit_price NUMERIC(14, 2),
    purchase_date DATE,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    supplier_pin VARCHAR(64),
    supplier_name VARCHAR(255),
    supplier_invoice_number VARCHAR(120),
    created_by_name VARCHAR(255),
    source_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    payload_json JSONB,
    proxy_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (proxy_status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    proxy_response JSONB,
    proxy_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tank_inventory_ledger_station_id ON tank_inventory_ledger(station_id);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_ledger_tank_id ON tank_inventory_ledger(tank_id);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_ledger_effective_at ON tank_inventory_ledger(effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_ledger_proxy_status ON tank_inventory_ledger(proxy_status);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_ledger_source_transaction_id ON tank_inventory_ledger(source_transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS tank_inventory_ledger_transaction_deduction_unique
    ON tank_inventory_ledger(station_id, tank_id, source_transaction_id)
    WHERE movement_type = 'DEDUCTION' AND source_transaction_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscalization_events_updated_at ON fiscalization_events;
CREATE TRIGGER update_fiscalization_events_updated_at BEFORE UPDATE ON fiscalization_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_receipts_updated_at ON receipts;
CREATE TRIGGER update_receipts_updated_at BEFORE UPDATE ON receipts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transaction_lines_updated_at ON transaction_lines;
CREATE TRIGGER update_transaction_lines_updated_at BEFORE UPDATE ON transaction_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_notes_updated_at ON credit_notes;
CREATE TRIGGER update_credit_notes_updated_at BEFORE UPDATE ON credit_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ewura_transactions_updated_at ON ewura_transactions;
CREATE TRIGGER update_ewura_transactions_updated_at BEFORE UPDATE ON ewura_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ewura_reports_updated_at ON ewura_reports;
CREATE TRIGGER update_ewura_reports_updated_at BEFORE UPDATE ON ewura_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tank_inventory_ledger_updated_at ON tank_inventory_ledger;
CREATE TRIGGER update_tank_inventory_ledger_updated_at BEFORE UPDATE ON tank_inventory_ledger
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
