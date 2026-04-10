import type { ProxyRequestResult } from '@/src/shared/proxy/client'

import {
  getRegistrationStatusViaProxy as legacyGetRegistrationStatusViaProxy,
  registerDeviceViaProxy as legacyRegisterDeviceViaProxy,
} from '@/src/shared/proxy/client'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type { ProxyRequestResult }

export async function registerDeviceViaProxy(
  stationId: string | undefined,
  payload: unknown,
): Promise<ProxyRequestResult> {
  return await legacyRegisterDeviceViaProxy(
    requireNonEmptyString(stationId, 'stationId'),
    payload ?? {},
  )
}

export async function getRegistrationStatusViaProxy(
  stationId: string | undefined,
): Promise<ProxyRequestResult> {
  return await legacyGetRegistrationStatusViaProxy(
    requireNonEmptyString(stationId, 'stationId'),
  )
}
