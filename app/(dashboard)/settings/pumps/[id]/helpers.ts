import type { PumpNozzle, PumpStateSnapshot } from '@/src/shared/pumps/types'

import {
  PUMP_NOZZLE_STATE,
  SIM_PUMP_STATE,
  STATUS_VARIANT,
} from '@/src/shared/status/ui'

import type { NozzleFormState, SimPump } from './types'

export const emptyForm = (): NozzleFormState => ({
  nozzleNumber: '',
  tankId: '',
})

export const gradeLabel = (nozzleNumber: number) =>
  `Grade ${nozzleNumber} (Nozzle ${nozzleNumber})`

const mapSimStateToNozzleState = (pump: SimPump) => {
  if (!pump.online) return PUMP_NOZZLE_STATE.IDLE
  switch (pump.state) {
    case SIM_PUMP_STATE.DISPENSING:
    case SIM_PUMP_STATE.PAUSED:
      return PUMP_NOZZLE_STATE.NOZZLE_UP
    case SIM_PUMP_STATE.CALL:
      return PUMP_NOZZLE_STATE.AUTH
    case SIM_PUMP_STATE.TRANS_READY:
      return PUMP_NOZZLE_STATE.NOZZLE_DOWN
    case SIM_PUMP_STATE.IDLE:
    default:
      return pump.authorized ? PUMP_NOZZLE_STATE.AUTH : PUMP_NOZZLE_STATE.IDLE
  }
}

export const upsertSimPump = (
  prev: PumpStateSnapshot | null,
  stationId: string,
  pump: SimPump,
) => {
  const snapshot: PumpStateSnapshot = prev ?? {
    stationId,
    pumps: [],
    updatedAt: Date.now(),
  }

  const pumpId = String(pump.id)
  const nozzleId = String(pump.gradeSelected ?? 1)
  const nozzleState = mapSimStateToNozzleState(pump)

  const pumps = snapshot.pumps.slice()
  const existing = pumps.find((item) => item.pumpId === pumpId)
  const now = Date.now()

  const nozzle: PumpNozzle = {
    nozzleId,
    state: nozzleState,
    updatedAt: now,
  }

  if (existing) {
    const nozzles = existing.nozzles.slice()
    const nozzleIndex = nozzles.findIndex((n) => n.nozzleId === nozzleId)
    if (nozzleIndex >= 0) {
      nozzles[nozzleIndex] = { ...nozzles[nozzleIndex], ...nozzle }
    } else {
      nozzles.push(nozzle)
    }
    const updated = {
      ...existing,
      nozzles,
      updatedAt: now,
    }
    const idx = pumps.findIndex((item) => item.pumpId === pumpId)
    pumps[idx] = updated
  } else {
    pumps.push({
      pumpId,
      nozzles: [nozzle],
      updatedAt: now,
      lastSeenAt: now,
      health: 'unknown',
    })
  }

  return {
    ...snapshot,
    pumps,
    updatedAt: now,
  }
}

export const stateVariant = (state: string) => {
  switch (state) {
    case PUMP_NOZZLE_STATE.ERROR:
      return STATUS_VARIANT.ERROR
    case PUMP_NOZZLE_STATE.PREAUTHORIZED:
      return STATUS_VARIANT.WARN
    case PUMP_NOZZLE_STATE.CALLING:
    case PUMP_NOZZLE_STATE.STARTING:
    case PUMP_NOZZLE_STATE.NOZZLE_UP:
    case PUMP_NOZZLE_STATE.DISPENSING:
    case PUMP_NOZZLE_STATE.DISPENSING_PAUSED:
      return STATUS_VARIANT.INFO
    case PUMP_NOZZLE_STATE.AUTH:
      return STATUS_VARIANT.WARN
    case PUMP_NOZZLE_STATE.CLOSED:
    case PUMP_NOZZLE_STATE.UNAVAILABLE:
    case PUMP_NOZZLE_STATE.UNCONFIGURED:
    case PUMP_NOZZLE_STATE.NOZZLE_DOWN:
      return STATUS_VARIANT.NEUTRAL
    case PUMP_NOZZLE_STATE.IDLE:
      return STATUS_VARIANT.SUCCESS
    default:
      return STATUS_VARIANT.NEUTRAL
  }
}

export const formatState = (state?: string | null) => {
  if (!state) return 'Unknown'
  if (state === PUMP_NOZZLE_STATE.PREAUTHORIZED) return 'PRE-AUTHORIZED'
  return state.replace(/_/g, ' ').toUpperCase()
}

export const formatLastSeen = (value: number | null | undefined) => {
  if (!value) return 'Never'
  return new Date(value).toLocaleTimeString()
}
