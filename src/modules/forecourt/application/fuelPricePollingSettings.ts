import { queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type FuelPricePollingSettings = {
  enabled: boolean
}

export async function getFuelPricePollingSettings(
  stationId: string,
): Promise<FuelPricePollingSettings> {
  const row = await queryOne<{ fuel_price_polling_enabled: boolean | null }>(
    `SELECT fuel_price_polling_enabled
       FROM station_settings
      WHERE station_id = $1`,
    [stationId],
  )

  return {
    enabled: Boolean(row?.fuel_price_polling_enabled),
  }
}

export async function updateFuelPricePollingSettings(
  stationId: string,
  input: { enabled?: unknown },
): Promise<FuelPricePollingSettings> {
  const enabled = input.enabled === true

  await queryOne(
    `INSERT INTO station_settings (
       id,
       station_id,
       fuel_price_polling_enabled
     ) VALUES ($1, $2, $3)
     ON CONFLICT (station_id)
     DO UPDATE SET
       fuel_price_polling_enabled = EXCLUDED.fuel_price_polling_enabled,
       updated_at = NOW()
     RETURNING station_id`,
    [uuidv4(), stationId, enabled],
  )

  return { enabled }
}
