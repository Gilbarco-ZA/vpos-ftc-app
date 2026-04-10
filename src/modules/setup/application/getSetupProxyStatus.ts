import { getRegistrationStatusViaProxy } from '@/src/shared/setup/proxy'
import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export async function getSetupProxyStatus(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const status = await getRegistrationStatusViaProxy(normalizedStationId)
  return ensurePlainObject(status)
}
