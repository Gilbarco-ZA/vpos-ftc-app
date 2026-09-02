import {
  extractProxyCountryCode,
  getRegistrationStatusViaProxy,
} from '@/src/shared/proxy/client'
import { storeStationKv } from '@/src/shared/setup/api'
import { registerDeviceViaProxy } from '@/src/shared/setup/proxy'
import { setSiteCountry } from '@/src/shared/setup/siteProfile'
import { validateRegistrationCode } from '@/src/shared/setup/validate'

const readCountryCode = (payload: Record<string, any>) => {
  const value =
    payload?.countryCode ??
    payload?.countryId ??
    payload?.country_code ??
    payload?.country_id ??
    payload?.CountryCode ??
    payload?.CountryId ??
    ''
  return String(value).trim().toUpperCase()
}

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

  const submittedCountryCode = readCountryCode(payload)
  const registrationPayload: Record<string, string> = {
    RegistrationCode: validation.code,
  }
  if (submittedCountryCode) {
    registrationPayload.countryCode = submittedCountryCode
  }

  const result = await registerDeviceViaProxy(stationId, registrationPayload)

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

  let countryCode = extractProxyCountryCode(result.data)
  if (!countryCode) {
    try {
      const status = await getRegistrationStatusViaProxy(stationId)
      countryCode = status.ok ? extractProxyCountryCode(status.data) : null
    } catch {}
  }
  countryCode ||= submittedCountryCode || null

  let countryResult: Awaited<ReturnType<typeof setSiteCountry>> | null = null
  if (countryCode) {
    countryResult = await setSiteCountry(stationId, countryCode)
  }

  await storeStationKv(stationId, 'vpos.device.data', deviceData)
  await storeStationKv(stationId, 'vpos.device.registration', {
    isRegistered: true,
    registeredAt: new Date().toISOString(),
    deviceId: (deviceData as any).deviceId,
    deviceName: (deviceData as any).deviceName,
    countryCode,
  })

  return {
    success: true,
    data: {
      ...deviceData,
      countryCode,
      countryId: countryCode,
      siteProfile: countryResult?.siteProfile,
      needsCountry: !countryCode,
    },
  }
}
