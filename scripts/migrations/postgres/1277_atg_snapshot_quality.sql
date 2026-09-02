-- Preserve the data-quality state that accompanies the latest DOMS TgData snapshot.

ALTER TABLE tank_atg_snapshots
  ADD COLUMN IF NOT EXISTS gauge_online BOOLEAN,
  ADD COLUMN IF NOT EXISTS inventory_data_ready BOOLEAN,
  ADD COLUMN IF NOT EXISTS gauge_alarm_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS gauge_error_active BOOLEAN;

COMMENT ON COLUMN tank_atg_snapshots.gauge_online IS
  'Latest TgSubStates TankGaugeOnline flag observed with this snapshot.';
COMMENT ON COLUMN tank_atg_snapshots.inventory_data_ready IS
  'Latest TgSubStates AllAvailableInventoryDataReady flag observed with this snapshot.';
COMMENT ON COLUMN tank_atg_snapshots.gauge_alarm_active IS
  'Latest TgSubStates TankGaugeAlarmActive flag observed with this snapshot.';
COMMENT ON COLUMN tank_atg_snapshots.gauge_error_active IS
  'Latest TgSubStates TankGaugeErrorActive flag observed with this snapshot.';
