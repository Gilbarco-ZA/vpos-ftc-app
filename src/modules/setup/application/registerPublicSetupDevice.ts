import { storeStationKv } from '@/src/shared/setup/api'
import { registerDeviceViaProxy } from '@/src/shared/setup/proxy'
import { validateRegistrationCode } from '@/src/shared/setup/validate'

export async function registerPublicSetupDevice(
  stationId: string,
  payload: Record<string, any>,
) {
  const registrationCode = String(
    payload?.RegistrationCode || payload?.registrationCode || '',
  ).trim()
  const validation = validateRegistrationCode(registrationCode)
  if (!validation.ok) {
    return { success: false, status: 400, error: validation.error }
  }

  const result = await registerDeviceViaProxy(stationId, {
    RegistrationCode: validation.code,
  })

  if (!result.ok) {
    return {
      success: false,
      status: result.status || 502,
      error:
        result.data?.message ||
        result.data?.error ||
        'Device registration failed',
    }
  }

  const deviceData =
    result.data && typeof result.data === 'object' ? { ...result.data } : {}
  delete (deviceData as any).apiKey
  delete (deviceData as any).api_key

  await storeStationKv(stationId, 'vpos.device.data', deviceData)
  await storeStationKv(stationId, 'vpos.device.registration', {
    isRegistered: true,
    registeredAt: new Date().toISOString(),
    deviceId: (deviceData as any).deviceId,
    deviceName: (deviceData as any).deviceName,
  })

  return { success: true, data: deviceData }
}
