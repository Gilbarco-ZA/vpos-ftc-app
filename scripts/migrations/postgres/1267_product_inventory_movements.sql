-- Add an auditable inventory ledger for non-fuel product stock movements.

CREATE TABLE IF NOT EXISTS product_inventory_movements (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    product_record_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(20) NOT NULL
        CHECK (movement_type IN ('STOCK_IN', 'STOCK_OUT')),
    reason_code VARCHAR(45) NOT NULL,
    quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(18, 6),
    document_id VARCHAR(120) NOT NULL,
    document_reference VARCHAR(120),
    remarks TEXT,
    supplier_name VARCHAR(255),
    supplier_pin VARCHAR(120),
    supplier_invoice_number VARCHAR(120),
    effective_at TIMESTAMPTZ NOT NULL,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255) NOT NULL,
    proxy_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (proxy_status IN ('PENDING', 'SENT', 'FAILED')),
    proxy_response JSONB,
    proxy_sent_at TIMESTAMPTZ,
    proxy_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_product_inventory_movements_product
    ON product_inventory_movements(station_id, product_record_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_inventory_movements_proxy_status
    ON product_inventory_movements(station_id, proxy_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_inventory_movements_recent
    ON product_inventory_movements(station_id, effective_at DESC, created_at DESC);

DROP TRIGGER IF EXISTS update_product_inventory_movements_updated_at
    ON product_inventory_movements;
CREATE TRIGGER update_product_inventory_movements_updated_at
    BEFORE UPDATE ON product_inventory_movements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
