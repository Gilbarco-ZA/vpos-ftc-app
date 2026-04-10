import {
  kvDelete as platformKvDelete,
  kvGet as platformKvGet,
  kvGetMany as platformKvGetMany,
  kvSet as platformKvSet,
} from '@/src/platform/config/station-kv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

function normalizeStationKvKey(stationId: string, key: string) {
  return {
    stationId: requireNonEmptyString(stationId, 'stationId'),
    key: requireNonEmptyString(key, 'key'),
  }
}

/**
 * Shared storage exposes a stable station KV contract for modules/routes.
 * The DB-backed implementation stays in platform config infrastructure.
 */
export async function kvGet<T>(
  stationId: string,
  key: string,
): Promise<T | null> {
  const normalized = normalizeStationKvKey(stationId, key)
  return await platformKvGet<T>(normalized.stationId, normalized.key)
}

export async function kvGetMany<T = any>(
  stationId: string,
  keys: string[],
): Promise<Record<string, T | null>> {
  return await platformKvGetMany<T>(stationId, keys)
}

export async function kvSet<T>(
  stationId: string,
  key: string,
  value: T,
): Promise<void> {
  const normalized = normalizeStationKvKey(stationId, key)
  await platformKvSet<T>(normalized.stationId, normalized.key, value)
}

export async function kvDelete(stationId: string, key: string): Promise<void> {
  const normalized = normalizeStationKvKey(stationId, key)
  await platformKvDelete(normalized.stationId, normalized.key)
}
