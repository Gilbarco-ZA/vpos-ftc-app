-- Distinguish local-only POS inventory movements from proxy-bound manual/import movements.

ALTER TABLE product_inventory_movements
    DROP CONSTRAINT IF EXISTS product_inventory_movements_proxy_status_check;

ALTER TABLE product_inventory_movements
    ADD CONSTRAINT product_inventory_movements_proxy_status_check
    CHECK (proxy_status IN ('PENDING', 'SENT', 'FAILED', 'NOT_REQUIRED'));

ALTER TABLE product_inventory_movements
    DROP CONSTRAINT IF EXISTS product_inventory_movements_source_type_check;

ALTER TABLE product_inventory_movements
    ADD CONSTRAINT product_inventory_movements_source_type_check
    CHECK (source_type IN ('MANUAL', 'POS_TRANSACTION', 'CSV_IMPORT'));

UPDATE product_inventory_movements
   SET proxy_status = 'NOT_REQUIRED',
       proxy_error = NULL,
       updated_at = NOW()
 WHERE source_type = 'POS_TRANSACTION'
   AND proxy_status <> 'NOT_REQUIRED';
