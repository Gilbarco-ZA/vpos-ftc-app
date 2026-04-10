// Station settings are shared read/write contracts with platform-owned storage.
import type { StationSettings } from '@/src/shared/types'

import {
  getStationSettings as platformGetStationSettings,
  updateStationSettings as platformUpdateStationSettings,
} from '@/src/platform/config/station-settings'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getStationSettings(stationId: string) {
  return await platformGetStationSettings(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export async function updateStationSettings(
  stationId: string,
  patch: Partial<StationSettings>,
) {
  return await platformUpdateStationSettings(
    requireNonEmptyString(stationId, 'stationId'),
    patch,
  )
}
