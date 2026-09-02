import { kvGet, kvSet } from '@/src/platform/config/station-kv'
import { query, queryAll } from '@/src/platform/db/postgres'

const PREFIX = 'env:'

export type EnvironmentValueSource = Readonly<
  Record<string, string | undefined>
>

export const resolveEnvValueFromSources = (
  name: string,
  persistedValue: unknown,
  defaultValue?: string,
  env: EnvironmentValueSource = process.env,
): string | undefined => {
  const direct = env[name]
  if (direct != null && String(direct).length) return String(direct)

  if (persistedValue == null) return defaultValue
  const stored = String(persistedValue)
  return stored.length ? stored : defaultValue
}

export async function getEnvValue(
  stationId: string,
  name: string,
  defaultValue?: string,
): Promise<string | undefined> {
  const fromDb = await kvGet<unknown>(stationId, PREFIX + name)
  return resolveEnvValueFromSources(name, fromDb, defaultValue)
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
