import {
  defaultTankConfig,
  normalizeTankConfig,
} from '@/src/shared/settings/tanksConfig'

import { getTankConfigRepo } from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getTankCloudSettings(stationId: string) {
  const stored = await getTankConfigRepo(stationId)
  return normalizeTankConfig(stored ?? defaultTankConfig)
}
