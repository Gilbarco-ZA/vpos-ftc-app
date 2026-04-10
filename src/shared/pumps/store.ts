import type {
  NozzleState,
  PumpHealth,
  PumpNozzle,
  PumpState,
  PumpStateSnapshot,
} from '@/src/shared/pumps/types'

import {
  applyPumpMessage as applyPumpMessageModule,
  getPumpState as getPumpStateModule,
  startPumpBusListener as startPumpBusListenerModule,
  subscribePumpState as subscribePumpStateModule,
  updatePumpState as updatePumpStateModule,
} from '@/src/modules/pumps/infrastructure/pumpStore'

export type {
  NozzleState,
  PumpHealth,
  PumpNozzle,
  PumpState,
  PumpStateSnapshot,
}

export function applyPumpMessage(message: unknown) {
  if (message == null || typeof message !== 'object') {
    throw new Error('message is required')
  }
  return applyPumpMessageModule(message as any)
}

export function getPumpState(stationId: string) {
  return getPumpStateModule(stationId)
}

export function updatePumpState(
  stationId: string,
  nextState: {
    pumpId: string
    nozzles: Array<{ nozzleId: string; fuelType?: string; state: NozzleState }>
  },
) {
  if (!nextState || typeof nextState !== 'object') {
    throw new Error('nextState is required')
  }
  return updatePumpStateModule(stationId, nextState)
}

export function startPumpBusListener() {
  return startPumpBusListenerModule()
}

export function subscribePumpState(
  listener: (state: PumpStateSnapshot) => void,
) {
  return subscribePumpStateModule(listener)
}
