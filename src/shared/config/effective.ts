import { getEffectiveSystemConfiguration as platformGetEffectiveSystemConfiguration } from '@/src/platform/config/effective'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getEffectiveSystemConfiguration(stationId: string) {
  return await platformGetEffectiveSystemConfiguration(
    requireNonEmptyString(stationId, 'stationId'),
  )
}
