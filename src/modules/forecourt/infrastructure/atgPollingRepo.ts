import { queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type AtgPollingSettingsRow = {
  atg_polling_enabled: boolean | null
  atg_polling_interval_seconds: number | string | null
}

export async function getAtgPollingSettingsRepo(stationId: string) {
  return await queryOne<AtgPollingSettingsRow>(
    `SELECT atg_polling_enabled, atg_polling_interval_seconds
       FROM station_settings
      WHERE station_id = $1`,
    [stationId],
  )
}

export async function saveAtgPollingSettingsRepo(input: {
  stationId: string
  enabled: boolean
  intervalSeconds: number
}) {
  await queryOne(
    `INSERT INTO station_settings (
       id,
       station_id,
       atg_polling_enabled,
       atg_polling_interval_seconds
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (station_id)
     DO UPDATE SET
       atg_polling_enabled = EXCLUDED.atg_polling_enabled,
       atg_polling_interval_seconds = EXCLUDED.atg_polling_interval_seconds,
       updated_at = NOW()
     RETURNING station_id`,
    [uuidv4(), input.stationId, input.enabled, input.intervalSeconds],
  )
}
