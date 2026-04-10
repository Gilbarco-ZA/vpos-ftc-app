import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export const PUMP_MODE_KEY = 'pump.mode'

export type PumpModeConfig = {
  fpIds: number[]
  skipAttendantAuthFpIds: number[]
}

export const normalizePumpIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Number(item))
}

export function normalizePumpModeConfig(value: unknown): PumpModeConfig {
  const candidate =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    fpIds: normalizePumpIds(candidate.fpIds),
    skipAttendantAuthFpIds: normalizePumpIds(candidate.skipAttendantAuthFpIds),
  }
}

export async function getPumpModeConfig(
  stationId: string,
): Promise<PumpModeConfig | null> {
  const value = await kvGet<PumpModeConfig>(
    requireNonEmptyString(stationId, 'stationId'),
    PUMP_MODE_KEY,
  )
  return value ? normalizePumpModeConfig(value) : null
}

export async function savePumpModeConfig(
  stationId: string,
  value: PumpModeConfig,
): Promise<void> {
  await kvSet(
    requireNonEmptyString(stationId, 'stationId'),
    PUMP_MODE_KEY,
    normalizePumpModeConfig(value),
  )
}
