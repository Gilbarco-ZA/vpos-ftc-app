import { getRegistrationStatusViaProxy } from '@/src/shared/proxy/client'

import { normalizeTanzaniaRegisteredReceiptCode } from '../domain/receiptVerificationPrefix'

const firstNonBlank = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeTanzaniaRegisteredReceiptCode(value)
    if (normalized) return normalized
  }
  return null
}

export function extractRegisteredReceiptCode(value: unknown): string | null {
  const payload =
    value && typeof value === 'object' ? ((value as any)?.data ?? value) : null
  if (!payload || typeof payload !== 'object') return null

  const identity =
    payload.identity && typeof payload.identity === 'object'
      ? payload.identity
      : {}
  const registrationStatus =
    payload.registrationStatus && typeof payload.registrationStatus === 'object'
      ? payload.registrationStatus
      : {}
  const registrationIdentity =
    registrationStatus.identity && typeof registrationStatus.identity === 'object'
      ? registrationStatus.identity
      : {}
  const deviceSettings =
    payload.deviceSettings && typeof payload.deviceSettings === 'object'
      ? payload.deviceSettings
      : {}

  return firstNonBlank(
    payload.receiptCode,
    payload.receiptcode,
    payload.receipt_code,
    identity.receiptCode,
    identity.receiptcode,
    identity.receipt_code,
    registrationStatus.receiptCode,
    registrationStatus.receiptcode,
    registrationStatus.receipt_code,
    registrationIdentity.receiptCode,
    registrationIdentity.receiptcode,
    registrationIdentity.receipt_code,
    deviceSettings.receiptCode,
    deviceSettings.receiptcode,
    deviceSettings.receipt_code,
  )
}

export async function getRegisteredTanzaniaReceiptCode(
  stationId: string,
): Promise<string | null> {
  try {
    const response = await getRegistrationStatusViaProxy(stationId)
    if (!response.ok) return null
    return extractRegisteredReceiptCode(response.data)
  } catch {
    return null
  }
}
