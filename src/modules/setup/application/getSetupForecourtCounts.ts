import { queryOne } from '@/src/platform/db/postgres'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getSetupForecourtCounts(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')

  const [products, pumps, tanks, nozzles] = await Promise.all([
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM products WHERE station_id = $1',
      [normalizedStationId],
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM pumps WHERE station_id = $1',
      [normalizedStationId],
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM tanks WHERE station_id = $1',
      [normalizedStationId],
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(1)::text AS count FROM nozzles WHERE station_id = $1',
      [normalizedStationId],
    ),
  ])

  return {
    products: Number(products?.count ?? 0),
    tanks: Number(tanks?.count ?? 0),
    pumps: Number(pumps?.count ?? 0),
    nozzles: Number(nozzles?.count ?? 0),
  }
}
