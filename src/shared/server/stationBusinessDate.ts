import { queryOne } from '@/src/platform/db/postgres'

export async function getStationCurrentBusinessDate(
  stationId: string,
): Promise<string> {
  const row = await queryOne<{ business_date: string }>(
    `SELECT TO_CHAR(
       CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(BTRIM(timezone), ''), 'UTC'),
       'YYYY-MM-DD'
     ) AS business_date
       FROM fuel_stations
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [stationId],
  )

  return row?.business_date || new Date().toISOString().slice(0, 10)
}
