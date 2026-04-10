import { queryOne } from '@/src/platform/db/postgres'
import { createUser, updatePassword } from '@/src/shared/auth'
import { registerDeviceViaProxy } from '@/src/shared/setup/proxy'
import { storeStationKv } from '@/src/shared/setup/storage'
import {
  validateRegistrationCode,
  validateSetupPayload,
} from '@/src/shared/setup/validate'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

type SetupPayload = {
  deviceRegistration?: {
    RegistrationCode?: string
    registrationCode?: string
  }
  authConfig?: {
    username?: string
    password?: string
    email?: string
    fullName?: string
  }
}

export async function completeSetup(stationId: string, body: SetupPayload) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const payload = ensurePlainObject<SetupPayload>(body || {})
  const vPayload = validateSetupPayload(payload)
  if (!vPayload.ok) return { success: false, error: vPayload.error }

  const regCode =
    payload?.deviceRegistration?.RegistrationCode ||
    payload?.deviceRegistration?.registrationCode ||
    ''
  const v = validateRegistrationCode(regCode)
  if (!v.ok) return { success: false, error: v.error }

  const registerRes = await registerDeviceViaProxy(normalizedStationId, {
    RegistrationCode: v.code,
  })
  if (!registerRes.ok) {
    return {
      success: false,
      error:
        (registerRes.data as any)?.message ||
        (registerRes.data as any)?.error ||
        'Device registration failed',
      status: registerRes.status || 502,
      proxy: { url: registerRes.url },
    }
  }

  const deviceData =
    registerRes.data && typeof registerRes.data === 'object'
      ? { ...(registerRes.data as any) }
      : {}
  delete (deviceData as any).apiKey
  delete (deviceData as any).api_key

  await storeStationKv(normalizedStationId, 'vpos.device.data', deviceData)
  await storeStationKv(normalizedStationId, 'vpos.device.registration', {
    isRegistered: true,
    registeredAt: new Date().toISOString(),
    deviceId: (deviceData as any).deviceId,
    deviceName: (deviceData as any).deviceName,
  })

  const auth = payload?.authConfig || {}
  const username = String(auth.username || '').trim()
  const password = String(auth.password || '').trim()
  const email = String(
    auth.email || (username ? `${username}@local` : ''),
  ).trim()
  const fullName = String(auth.fullName || '').trim()

  if (username && password) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM users
       WHERE station_id = $1
         AND deleted_at IS NULL
         AND (username = $2 OR email = $3)
       LIMIT 1`,
      [normalizedStationId, username, email],
    )

    if (existing?.id) {
      await updatePassword(existing.id, password)
    } else {
      await createUser({
        stationId: normalizedStationId,
        username,
        email: email || `${username}@local`,
        password,
        role: 'administrator',
        fullName: fullName || undefined,
      })
    }
  }

  return {
    success: true,
    message: 'Setup complete',
    deviceId: (deviceData as any).deviceId,
    deviceName: (deviceData as any).deviceName,
  }
}
