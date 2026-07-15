import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { findPumpByIdRepo } from '@/src/modules/settings/infrastructure/settingsRepo'

export async function getPumpSetting(stationId: string, pumpId: string) {
  const row = await findPumpByIdRepo(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(pumpId, 'pumpId'),
  )

  if (!row) return null

  return {
    id: String(row.id),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    status: String(row.status ?? 'ACTIVE'),
    hasNozzleSelector: Boolean(row.has_nozzle_selector),
    pumpNumber: Number(row.pump_number ?? 0),
  }
}
