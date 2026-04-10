import { normalizePumpIds } from '@/src/shared/settings/pumpMode'

import {
  getPumpModeConfigRepo,
  listPumpNumbersRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getPumpModeSettings(stationId: string) {
  const availablePumps = await listPumpNumbersRepo(stationId)
  const stored = await getPumpModeConfigRepo(stationId)
  const selectedPumps = normalizePumpIds(stored?.skipAttendantAuthFpIds).filter(
    (value) => availablePumps.includes(value),
  )

  return {
    availablePumps,
    selectedPumps,
  }
}
