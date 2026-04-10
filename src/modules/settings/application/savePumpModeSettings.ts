import type { PumpModeConfig } from '@/src/shared/settings/pumpMode'

import { badRequest } from '@/src/platform/web/api/response'
import { normalizePumpIds } from '@/src/shared/settings/pumpMode'

import {
  listPumpNumbersRepo,
  savePumpModeConfigRepo,
} from '@/src/modules/settings/infrastructure/settingsRepo'

export async function savePumpModeSettings(
  stationId: string,
  body: Record<string, unknown>,
) {
  const availablePumps = await listPumpNumbersRepo(stationId)
  const payload = ((body?.data ?? body) || {}) as Record<string, unknown>
  const selectedPumps = normalizePumpIds(
    payload?.selectedPumps ?? payload?.skipAttendantAuthFpIds,
  )
  const invalid = selectedPumps.filter(
    (value) => !availablePumps.includes(value),
  )
  if (invalid.length) {
    return badRequest('Invalid pump selection')
  }

  const next: PumpModeConfig = {
    fpIds: availablePumps,
    skipAttendantAuthFpIds: selectedPumps,
  }

  await savePumpModeConfigRepo(stationId, next)
  return {
    availablePumps,
    selectedPumps,
  }
}
