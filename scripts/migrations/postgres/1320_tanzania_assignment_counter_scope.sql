-- Tanzania invoice daily counters are scoped to the originating transaction
-- date, while z_number and invoice_date are scoped to the fiscalization date.
-- A delayed transaction can therefore legitimately reuse a daily_counter value
-- under a later z_number. The original (station_id, z_number, daily_counter)
-- uniqueness constraint incorrectly rejects that supported case.
--
-- Transaction/invoice identity remains protected by:
--   PRIMARY KEY (station_id, transaction_id)
--   UNIQUE (station_id, invoice_number)
--   UNIQUE (station_id, global_counter)

ALTER TABLE tanzania_proxy_invoice_assignments
  DROP CONSTRAINT IF EXISTS
    tanzania_proxy_invoice_assign_station_id_z_number_daily_cou_key;
