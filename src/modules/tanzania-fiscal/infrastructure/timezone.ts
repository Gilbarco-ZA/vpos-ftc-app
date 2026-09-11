import { KV_KEYS } from '@/src/shared/setup/keys'
import { kvGet } from '@/src/shared/storage/stationKv'

function isValidIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

export function deviceLocalTimezone() {
  const resolved = String(
    Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || 'UTC',
  ).trim()
  return isValidIanaTimezone(resolved) ? resolved : 'UTC'
}

export function resolveLocalTimezone(override?: unknown) {
  const explicit = String(override ?? '').trim()
  if (!explicit) return deviceLocalTimezone()
  if (!isValidIanaTimezone(explicit)) {
    throw new Error(`Invalid site timezone override: ${explicit}`)
  }
  return explicit
}

export async function resolveTanzaniaFiscalTimezone(stationId: string) {
  const profile = await kvGet<{ timezone?: string | null }>(
    stationId,
    KV_KEYS.SITE_PROFILE,
  )

  // Site Profile is the only explicit fiscal-timezone override. If it is not
  // configured, use the operating device/runtime timezone instead of a
  // country-specific or database default.
  return resolveLocalTimezone(profile?.timezone)
}
