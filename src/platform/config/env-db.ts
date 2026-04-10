import { kvGet, kvSet } from '@/src/platform/config/station-kv'
import { query, queryAll } from '@/src/platform/db/postgres'

const PREFIX = 'env:'

export async function getEnvValue(
  stationId: string,
  name: string,
  defaultValue?: string,
): Promise<string | undefined> {
  const direct = process.env[name]
  if (direct != null && String(direct).length) return String(direct)

  const fromDb = await kvGet<any>(stationId, PREFIX + name)
  if (fromDb == null) return defaultValue
  const s = String(fromDb)
  return s.length ? s : defaultValue
}

export async function setEnvValue(
  stationId: string,
  name: string,
  value: string,
): Promise<void> {
  await kvSet(stationId, PREFIX + name, value)
}

export async function listEnvValues(stationId: string) {
  return await queryAll<{ key: string; value: any }>(
    `SELECT key, value
     FROM station_kv
     WHERE station_id = $1 AND key LIKE $2
     ORDER BY key ASC`,
    [stationId, PREFIX + '%'],
  )
}

export async function deleteEnvValue(stationId: string, name: string) {
  await query(`DELETE FROM station_kv WHERE station_id = $1 AND key = $2`, [
    stationId,
    PREFIX + name,
  ])
}
