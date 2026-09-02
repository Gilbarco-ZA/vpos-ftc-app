type AnyRecord = Record<string, any>

export type RegistrationStatusFallbacks = {
  stationId: string
  stationName?: string | null
  deviceData?: unknown
  registrationData?: unknown
  proxyIdentity?: unknown
  updatedAt?: string
}

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return undefined
}

export function enrichRegistrationStatus(
  value: unknown,
  fallbacks: RegistrationStatusFallbacks,
): AnyRecord {
  const status = asRecord(value)
  const identity = asRecord(status.identity)
  const deviceSettings = asRecord(status.deviceSettings)
  const timestamps = asRecord(status.timestamps)
  const deviceData = asRecord(fallbacks.deviceData)
  const registrationData = asRecord(fallbacks.registrationData)
  const proxyIdentity = asRecord(fallbacks.proxyIdentity)
  const cachedIdentity = asRecord(deviceData.identity)
  const cachedDeviceSettings = asRecord(deviceData.deviceSettings)
  const registrationIdentity = asRecord(registrationData.identity)
  const registrationDeviceSettings = asRecord(registrationData.deviceSettings)

  return {
    ...status,
    identity: {
      ...proxyIdentity,
      ...identity,
      siteId: firstText(
        identity.siteId,
        status.siteId,
        proxyIdentity.siteId,
        cachedIdentity.siteId,
        deviceData.siteId,
        registrationIdentity.siteId,
        registrationData.siteId,
        fallbacks.stationId,
      ),
      siteName: firstText(
        identity.siteName,
        status.siteName,
        proxyIdentity.siteName,
        cachedIdentity.siteName,
        deviceData.siteName,
        deviceData.stationName,
        registrationIdentity.siteName,
        registrationData.siteName,
        fallbacks.stationName,
      ),
    },
    deviceSettings: {
      ...deviceData,
      ...deviceSettings,
      deviceId: firstText(
        deviceSettings.deviceId,
        status.deviceId,
        proxyIdentity.deviceId,
        cachedDeviceSettings.deviceId,
        deviceData.deviceId,
        registrationDeviceSettings.deviceId,
        registrationData.deviceId,
      ),
      deviceName: firstText(
        deviceSettings.deviceName,
        status.deviceName,
        proxyIdentity.deviceName,
        cachedDeviceSettings.deviceName,
        deviceData.deviceName,
        registrationDeviceSettings.deviceName,
        registrationData.deviceName,
      ),
    },
    timestamps: {
      ...timestamps,
      statusUpdatedAt: firstText(
        timestamps.statusUpdatedAt,
        status.updatedAt,
        registrationData.updatedAt,
        registrationData.registeredAt,
        fallbacks.updatedAt,
      ),
    },
  }
}
