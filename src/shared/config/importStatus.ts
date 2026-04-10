import type { ConfigImportDbRow } from '@/src/platform/config/import-status'

import { getCurrentStationConfigStatus as platformGetCurrentStationConfigStatus } from '@/src/platform/config/import-status'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type { ConfigImportDbRow }

export async function getCurrentStationConfigStatus(stationId: string) {
  return await platformGetCurrentStationConfigStatus(
    requireNonEmptyString(stationId, 'stationId'),
  )
}
