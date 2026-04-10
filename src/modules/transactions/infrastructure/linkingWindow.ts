import { queryOne, txQuery } from '@/src/platform/db/postgres'

export function normalizeLinkingWindowSeconds(raw: unknown): number | null {
  if (raw == null) return null

  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value <= 0) return null

  return Math.trunc(value)
}

export async function getStationLinkingWindowSeconds(
  stationId: string,
): Promise<number | null> {
  const row = await queryOne<{ linking_window_seconds: number | null }>(
    `SELECT linking_window_seconds FROM station_settings WHERE station_id = $1`,
    [stationId],
  )
  return normalizeLinkingWindowSeconds(row?.linking_window_seconds)
}

export async function getStationLinkingWindowSecondsSafe(
  stationId: string,
): Promise<number | null> {
  try {
    return await getStationLinkingWindowSeconds(stationId)
  } catch {
    return null
  }
}

export async function getStationLinkingWindowSecondsTx(
  client: Parameters<typeof txQuery>[0],
  stationId: string,
): Promise<number | null> {
  const res = await txQuery<{ linking_window_seconds: number | null }>(
    client,
    `SELECT linking_window_seconds FROM station_settings WHERE station_id = $1`,
    [stationId],
  )
  return normalizeLinkingWindowSeconds(res?.rows?.[0]?.linking_window_seconds)
}
