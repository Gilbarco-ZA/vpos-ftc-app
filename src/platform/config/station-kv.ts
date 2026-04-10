import { query, queryAll, queryOne } from '@/src/platform/db/postgres'

export async function kvGet<T>(
  stationId: string,
  key: string,
): Promise<T | null> {
  const row = await queryOne<{ value: T }>(
    `SELECT value FROM station_kv WHERE station_id = $1 AND key = $2`,
    [stationId, key],
  )
  return row?.value ?? null
}

export async function kvGetMany<T = any>(
  stationId: string,
  keys: string[],
): Promise<Record<string, T | null>> {
  const uniqueKeys = Array.from(new Set((keys ?? []).map((key) => String(key))))
  if (!uniqueKeys.length) return {}

  const rows = await queryAll<{ key: string; value: T }>(
    `SELECT key, value
       FROM station_kv
      WHERE station_id = $1
        AND key = ANY($2::text[])`,
    [stationId, uniqueKeys],
  )

  const map = new Map(rows.map((r) => [r.key, r.value]))
  return Object.fromEntries(keys.map((k) => [k, map.get(k) ?? null]))
}

export async function kvSet<T>(
  stationId: string,
  key: string,
  value: T,
): Promise<void> {
  const normalized = value === undefined ? null : value
  const payload = JSON.stringify(normalized)
  await query(
    `INSERT INTO station_kv (station_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (station_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     WHERE station_kv.value IS DISTINCT FROM EXCLUDED.value`,
    [stationId, key, payload],
  )
}

export async function kvDelete(stationId: string, key: string): Promise<void> {
  await query(`DELETE FROM station_kv WHERE station_id = $1 AND key = $2`, [
    stationId,
    key,
  ])
}
