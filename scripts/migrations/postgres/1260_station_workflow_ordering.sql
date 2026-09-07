ALTER TABLE station_settings
  ADD COLUMN IF NOT EXISTS print_receipt_order VARCHAR(32) NOT NULL DEFAULT 'after_fiscalization',
  ADD COLUMN IF NOT EXISTS tin_capture_order VARCHAR(32) NOT NULL DEFAULT 'after_transaction';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'station_settings_print_receipt_order_check'
       AND conrelid = 'station_settings'::regclass
  ) THEN
    ALTER TABLE station_settings
      ADD CONSTRAINT station_settings_print_receipt_order_check
      CHECK (print_receipt_order IN ('before_fiscalization', 'after_fiscalization'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'station_settings_tin_capture_order_check'
       AND conrelid = 'station_settings'::regclass
  ) THEN
    ALTER TABLE station_settings
      ADD CONSTRAINT station_settings_tin_capture_order_check
      CHECK (tin_capture_order IN ('before_transaction', 'after_transaction'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pre_fuel_customer_allocations (
  id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  pump_number INTEGER NOT NULL CHECK (pump_number > 0),
  nozzle_id UUID REFERENCES nozzles(id) ON DELETE CASCADE,
  nozzle_number INTEGER NOT NULL CHECK (nozzle_number > 0),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  allocated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONSUMED', 'CANCELLED')),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pre_fuel_customer_allocations_pending_nozzle
  ON pre_fuel_customer_allocations(station_id, pump_number, nozzle_number)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_pre_fuel_customer_allocations_station_status
  ON pre_fuel_customer_allocations(station_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pre_fuel_customer_allocations_transaction
  ON pre_fuel_customer_allocations(transaction_id)
  WHERE transaction_id IS NOT NULL;
