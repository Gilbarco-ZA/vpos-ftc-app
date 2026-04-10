import type { SystemConfiguration } from '@/src/shared/config/schema'
import type { StationConfigRow } from '@/src/shared/config/types'

import { systemConfigSchema } from '@/src/shared/config/schema'

export const mapStationConfigToSystemConfig = (
  stationConfig: StationConfigRow,
): SystemConfiguration => {
  return systemConfigSchema.parse(stationConfig.configJson)
}
