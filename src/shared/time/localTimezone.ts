import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'
import {
  deviceLocalTimezone,
  isValidIanaTimezone,
  resolveLocalTimezone,
} from '@/src/shared/time/timezoneCore'

export { deviceLocalTimezone, isValidIanaTimezone, resolveLocalTimezone }

export type StationTimezoneSource = 'site-profile' | 'device-runtime'

export type StationTimezoneContext = {
  timezone: string
  source: StationTimezoneSource
}

export async function resolveStationTimezoneContext(
  stationId: string,
): Promise<StationTimezoneContext> {
  const normalizedStationId = String(stationId ?? '').trim()
  if (!normalizedStationId) {
    return {
      timezone: deviceLocalTimezone(),
      source: 'device-runtime',
    }
  }

  const profile = await kvGet<{ timezone?: string | null }>(
    normalizedStationId,
    KV_KEYS.SITE_PROFILE,
  )
  const explicit = String(profile?.timezone ?? '').trim()

  if (explicit) {
    return {
      timezone: resolveLocalTimezone(explicit),
      source: 'site-profile',
    }
  }

  return {
    timezone: deviceLocalTimezone(),
    source: 'device-runtime',
  }
}

export async function resolveStationTimezone(stationId: string): Promise<string> {
  return (await resolveStationTimezoneContext(stationId)).timezone
}
