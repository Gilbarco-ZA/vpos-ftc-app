import { queryOne } from '@/src/platform/db/postgres'
import { localDateTime } from '@/src/shared/time/localDateTime'
import { resolveStationTimezone } from '@/src/shared/time/localTimezone'

export async function getStationCurrentBusinessDate(
  stationId: string,
): Promise<string> {
  const station = await queryOne<{ id: string }>(
    `SELECT id::text
       FROM fuel_stations
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [stationId],
  )
  if (!station?.id) throw new Error(`Station ${stationId} not found`)

  const timezone = await resolveStationTimezone(stationId)
  return localDateTime(new Date(), timezone).isoDate
}
