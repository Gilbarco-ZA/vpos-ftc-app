-- Link automatic non-fuel inventory movements to their originating POS transaction.

ALTER TABLE product_inventory_movements
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS source_transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS source_action VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'product_inventory_movements_source_type_check'
    ) THEN
        ALTER TABLE product_inventory_movements
            ADD CONSTRAINT product_inventory_movements_source_type_check
            CHECK (source_type IN ('MANUAL', 'POS_TRANSACTION'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'product_inventory_movements_source_action_check'
    ) THEN
        ALTER TABLE product_inventory_movements
            ADD CONSTRAINT product_inventory_movements_source_action_check
            CHECK (source_action IS NULL OR source_action IN ('CAPTURE', 'EDIT'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_inventory_movements_transaction
    ON product_inventory_movements(
        station_id,
        source_transaction_id,
        product_record_id,
        created_at ASC
    )
    WHERE source_type = 'POS_TRANSACTION';
