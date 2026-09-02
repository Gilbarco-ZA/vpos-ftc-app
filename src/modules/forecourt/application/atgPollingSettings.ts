import {
  getAtgPollingSettingsRepo,
  saveAtgPollingSettingsRepo,
} from '@/src/modules/forecourt/infrastructure/atgPollingRepo'

export const DEFAULT_ATG_POLLING_INTERVAL_MINUTES = 10
export const MIN_ATG_POLLING_INTERVAL_MINUTES = 1
export const MAX_ATG_POLLING_INTERVAL_MINUTES = 24 * 60

export type AtgPollingSettings = {
  enabled: boolean
  intervalMinutes: number
}

const normalizeIntervalMinutes = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_ATG_POLLING_INTERVAL_MINUTES
  return Math.trunc(parsed)
}

export async function getAtgPollingSettings(
  stationId: string,
): Promise<AtgPollingSettings> {
  const row = await getAtgPollingSettingsRepo(stationId)
  const seconds = Number(row?.atg_polling_interval_seconds ?? 600)
  const intervalMinutes = Number.isFinite(seconds)
    ? Math.max(1, Math.round(seconds / 60))
    : DEFAULT_ATG_POLLING_INTERVAL_MINUTES

  return {
    enabled: Boolean(row?.atg_polling_enabled),
    intervalMinutes,
  }
}

export async function updateAtgPollingSettings(
  stationId: string,
  input: { enabled?: unknown; intervalMinutes?: unknown },
): Promise<AtgPollingSettings> {
  const intervalMinutes = normalizeIntervalMinutes(input.intervalMinutes)

  if (
    intervalMinutes < MIN_ATG_POLLING_INTERVAL_MINUTES ||
    intervalMinutes > MAX_ATG_POLLING_INTERVAL_MINUTES
  ) {
    throw new Error(
      `ATG polling interval must be between ${MIN_ATG_POLLING_INTERVAL_MINUTES} and ${MAX_ATG_POLLING_INTERVAL_MINUTES} minutes`,
    )
  }

  const enabled = input.enabled === true
  await saveAtgPollingSettingsRepo({
    stationId,
    enabled,
    intervalSeconds: intervalMinutes * 60,
  })

  return { enabled, intervalMinutes }
}
