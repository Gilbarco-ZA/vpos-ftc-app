import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import type { NozzleState } from '../infrastructure/pumpStore'
import { updatePumpState } from '../infrastructure/pumpStore'

export async function updatePumpSnapshot(input: {
  stationId: string
  pumpId: string
  nozzles: Array<{
    nozzleId: string
    fuelType?: string
    state: NozzleState
  }>
}) {
  const stationId = requireNonEmptyString(input.stationId, 'stationId')
  const pumpId = requireNonEmptyString(input.pumpId, 'pumpId')
  const nozzles = Array.isArray(input.nozzles)
    ? input.nozzles
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          nozzleId: requireNonEmptyString(item.nozzleId, 'nozzleId'),
          fuelType:
            typeof item.fuelType === 'string'
              ? item.fuelType.trim() || undefined
              : undefined,
          state: item.state,
        }))
    : []

  updatePumpState(stationId, {
    pumpId,
    nozzles,
  })
  return { ok: true }
}
