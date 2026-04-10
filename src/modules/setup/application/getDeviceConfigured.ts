import { getSetupFlags } from '@/src/shared/setup/api'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getDeviceConfigured(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const flags = await getSetupFlags(normalizedStationId)
  return { configured: Boolean(flags.success), ...flags }
}
