import { kvGet, kvSet } from '@/src/shared/storage/stationKv'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export const CONSOLE_SETTINGS_KEY = 'console.settings'

export async function getConsoleSettingsValue<T = Record<string, unknown>>(
  stationId: string,
): Promise<T | null> {
  return await kvGet<T>(
    requireNonEmptyString(stationId, 'stationId'),
    CONSOLE_SETTINGS_KEY,
  )
}

export async function saveConsoleSettingsValue(
  stationId: string,
  value: Record<string, unknown>,
): Promise<void> {
  await kvSet(
    requireNonEmptyString(stationId, 'stationId'),
    CONSOLE_SETTINGS_KEY,
    ensurePlainObject(value),
  )
}
