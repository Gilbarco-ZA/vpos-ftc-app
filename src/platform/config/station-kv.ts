import {
  normalizeStationKvKey,
  prepareStationKvWrite,
} from '@/src/platform/config/station-kv-policy'
import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { logger } from '@/src/shared/utils/logger'

const warnedUnregisteredKeys = new Set<string>()

export async function kvGet<T>(
  stationId: string,
  key: string,
): Promise<T | null> {
  const normalizedKey = normalizeStationKvKey(key)
  const row = await queryOne<{ value: T }>(
    `SELECT value FROM station_kv WHERE station_id = $1 AND key = $2`,
    [stationId, normalizedKey],
  )
  return row?.value ?? null
}

export async function kvGetMany<T = any>(
  stationId: string,
  keys: string[],
): Promise<Record<string, T | null>> {
  const normalizedKeys = (keys ?? []).map((key) => normalizeStationKvKey(key))
  const uniqueKeys = Array.from(new Set(normalizedKeys))
  if (!uniqueKeys.length) return {}

  const rows = await queryAll<{ key: string; value: T }>(
    `SELECT key, value
       FROM station_kv
      WHERE station_id = $1
        AND key = ANY($2::text[])`,
    [stationId, uniqueKeys],
  )

  const map = new Map(rows.map((r) => [r.key, r.value]))
  return Object.fromEntries(
    normalizedKeys.map((key) => [key, map.get(key) ?? null]),
  )
}

export async function kvSet<T>(
  stationId: string,
  key: string,
  value: T,
): Promise<void> {
  const prepared = prepareStationKvWrite(key, value)

  if (
    !prepared.policy.registered &&
    !warnedUnregisteredKeys.has(prepared.key)
  ) {
    warnedUnregisteredKeys.add(prepared.key)
    logger.warn('[station-kv]', {
      msg: 'writing unregistered compatibility key',
      key: prepared.key,
      payloadBytes: prepared.payloadBytes,
    })
  }

  await query(
    `INSERT INTO station_kv (station_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (station_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     WHERE station_kv.value IS DISTINCT FROM EXCLUDED.value`,
    [stationId, prepared.key, prepared.payload],
  )
}

export async function kvDelete(stationId: string, key: string): Promise<void> {
  const normalizedKey = normalizeStationKvKey(key)
  await query(`DELETE FROM station_kv WHERE station_id = $1 AND key = $2`, [
    stationId,
    normalizedKey,
  ])
}
