import { queryOne } from '@/src/platform/db/postgres'
import { resolveStationTimezone } from '@/src/shared/time/localTimezone'

export async function getStationCurrentBusinessDate(
  stationId: string,
): Promise<string> {
  const timezone = await resolveStationTimezone(stationId)
  const row = await queryOne<{ business_date: string }>(
    `SELECT TO_CHAR(
       CURRENT_TIMESTAMP AT TIME ZONE $2,
       'YYYY-MM-DD'
     ) AS business_date
       FROM fuel_stations
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [stationId, timezone],
  )

  if (row?.business_date) return row.business_date

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
