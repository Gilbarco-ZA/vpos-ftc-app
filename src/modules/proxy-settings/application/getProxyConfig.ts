import { queryAll } from '@/src/platform/db/postgres'

const PREFIX = 'proxy.'

export async function getProxyConfig(stationId: string) {
  const rows = await queryAll<{ key: string; value: unknown }>(
    'SELECT key, value FROM station_kv WHERE station_id = $1 AND key LIKE $2 ORDER BY key',
    [stationId, `${PREFIX}%`],
  )
  const output: Record<string, unknown> = {}
  for (const row of rows) output[row.key.slice(PREFIX.length)] = row.value
  return output
}

export function proxyConfigStorageKey(key: string) {
  return `${PREFIX}${key}`
}
