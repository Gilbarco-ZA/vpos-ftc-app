import { query, queryOne } from '@/src/platform/db/postgres'
import { KV_KEYS } from '@/src/shared/setup/keys'
import { getRegistrationStatusViaProxy } from '@/src/shared/setup/proxy'
import { kvGet } from '@/src/shared/storage/stationKv'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

type JsonValue = unknown

export async function storeStationKv(
  stationId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const normalizedKey = requireNonEmptyString(key, 'key')
  await query(
    `INSERT INTO station_kv (station_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (station_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [normalizedStationId, normalizedKey, JSON.stringify(value ?? null)],
  )
}

export async function getStationKv<T = unknown>(
  stationId: string,
  key: string,
) {
  return await kvGet<T>(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(key, 'key'),
  )
}

export const getSetupFlags = async (stationId: string) => {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const deviceKv = await kvGet<JsonValue>(
    normalizedStationId,
    KV_KEYS.VPOS_DEVICE_DATA,
  )
  const registrationKv = await kvGet<JsonValue>(
    normalizedStationId,
    KV_KEYS.VPOS_DEVICE_REGISTRATION,
  )

  let proxyRegistered: boolean | null = null
  try {
    const proxyStatus = await getRegistrationStatusViaProxy(normalizedStationId)
    if (proxyStatus.ok && proxyStatus.data) {
      const isRegistered = (proxyStatus.data as any)?.isRegistered
      if (typeof isRegistered === 'boolean') {
        proxyRegistered = isRegistered
      }
    }
  } catch {
    proxyRegistered = null
  }

  const hasUsers = await queryOne<{ count: string }>(
    `SELECT COUNT(1)::text AS count FROM users WHERE station_id = $1 AND deleted_at IS NULL`,
    [normalizedStationId],
  )

  const deviceRegistered =
    proxyRegistered ??
    Boolean(
      (deviceKv as any)?.deviceId ||
      (deviceKv as any)?.isRegistered ||
      (registrationKv as any)?.registered ||
      (registrationKv as any)?.isRegistered,
    )

  const data = {
    deviceRegistered,
    usersConfigured: Number(hasUsers?.count || 0) > 0,
  }

  return { success: Object.values(data).every(Boolean), data }
}

export const getSetupStatus = async (stationId: string) => {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const deviceKv = await kvGet<JsonValue>(
    normalizedStationId,
    KV_KEYS.VPOS_DEVICE_DATA,
  )
  const registrationKv = await kvGet<JsonValue>(
    normalizedStationId,
    KV_KEYS.VPOS_DEVICE_REGISTRATION,
  )

  let proxyStatus: any = null
  let proxyError: string | null = null

  try {
    const res = await getRegistrationStatusViaProxy(normalizedStationId)
    if (res.ok) {
      proxyStatus = res.data

      if (proxyStatus?.deviceSettings) {
        await storeStationKv(
          normalizedStationId,
          KV_KEYS.VPOS_DEVICE_DATA,
          proxyStatus.deviceSettings,
        )
      }

      if (typeof proxyStatus?.isRegistered === 'boolean') {
        await storeStationKv(
          normalizedStationId,
          KV_KEYS.VPOS_DEVICE_REGISTRATION,
          {
            isRegistered: proxyStatus.isRegistered,
            updatedAt: new Date().toISOString(),
          },
        )
      }

      if (proxyStatus?.identity && typeof proxyStatus.identity === 'object') {
        await storeStationKv(
          normalizedStationId,
          KV_KEYS.PROXY_IDENTITY,
          proxyStatus.identity,
        )

        const existingProfile = await kvGet<any>(
          normalizedStationId,
          KV_KEYS.SITE_PROFILE,
        )
        if (!existingProfile?.siteName) {
          const siteName =
            String(proxyStatus.identity.siteName || '').trim() ||
            String(proxyStatus.deviceSettings?.deviceName || '').trim()

          if (siteName) {
            await storeStationKv(normalizedStationId, KV_KEYS.SITE_PROFILE, {
              siteName,
              country: proxyStatus.identity.countryCode || undefined,
              timezone: proxyStatus.identity.timezone || undefined,
            })
          }
        }
      }
    } else {
      proxyError =
        (res.data && ((res.data as any).message || (res.data as any).error)) ||
        'Proxy registration status failed'
    }
  } catch (err: any) {
    proxyError = err?.message || 'Proxy registration status error'
  }

  const device = proxyStatus?.deviceSettings ?? deviceKv ?? null
  const registration = proxyStatus
    ? { isRegistered: proxyStatus.isRegistered ?? false }
    : (registrationKv ?? null)

  return {
    success: true,
    data: {
      device,
      registration,
      proxyStatus: proxyStatus ?? null,
      proxyError,
    },
  }
}
