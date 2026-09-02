import { queryOne } from '@/src/platform/db/postgres'

export async function getStationConfigStatus(stationId: string) {
  const row = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM station_config WHERE station_id = $1) AS exists',
    [stationId],
  )
  return { hasConfig: Boolean(row?.exists) }
}
