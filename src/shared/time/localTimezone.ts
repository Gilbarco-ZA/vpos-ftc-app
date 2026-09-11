import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'

export type StationTimezoneSource = 'site-profile' | 'device-runtime'

export type StationTimezoneContext = {
  timezone: string
  source: StationTimezoneSource
}

export function isValidIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

export function deviceLocalTimezone(): string {
  const candidates = [
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    process.env.TZ,
  ]

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim()
    if (value && isValidIanaTimezone(value)) return value
  }

  throw new Error(
    'Unable to resolve the device/runtime local timezone. Configure a valid timezone in /admin/setup Site Profile or configure the host runtime timezone.',
  )
}

export function resolveLocalTimezone(override?: unknown): string {
  const explicit = String(override ?? '').trim()
  if (!explicit) return deviceLocalTimezone()
  if (!isValidIanaTimezone(explicit)) {
    throw new Error(`Invalid site timezone override: ${explicit}`)
  }
  return explicit
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
