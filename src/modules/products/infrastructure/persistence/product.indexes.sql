-- Promoted to scripts/migrations/postgres/053_products_read_path_indexes.sql.
-- Keep this file only as module-local documentation of the active indexes.

CREATE INDEX IF NOT EXISTS idx_products_station_sync_status_updated
  ON products (station_id, last_sync_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_station_class_code
  ON products (station_id, product_class_code);

CREATE INDEX IF NOT EXISTS idx_products_station_name
  ON products (station_id, product_name);
