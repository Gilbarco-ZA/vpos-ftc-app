import type {
  BufferSeverity,
  BufferThresholds,
  SimPump,
} from '@/components/pumps/pumpStatusTypes'
import type { BadgeProps } from '@/components/ui/badge'
import type { PumpStateSnapshot } from '@/src/shared/pumps/types'

import { DEFAULT_BUFFER_THRESHOLDS } from '@/src/shared/forecourt/bufferSeverity'
import {
  BUFFER_SEVERITY,
  FORECOURT_CONNECTION_STATUS,
  PUMP_NOZZLE_STATE,
  SIM_PUMP_STATE,
  STATUS_VARIANT,
} from '@/src/shared/status/ui'

export const statusVariant = (state: string): BadgeProps['variant'] => {
  switch (state) {
    case PUMP_NOZZLE_STATE.ERROR:
      return STATUS_VARIANT.ERROR
    case PUMP_NOZZLE_STATE.PREAUTHORIZED:
    case PUMP_NOZZLE_STATE.AUTH:
      return STATUS_VARIANT.WARN
    case PUMP_NOZZLE_STATE.CALLING:
    case PUMP_NOZZLE_STATE.STARTING:
    case PUMP_NOZZLE_STATE.NOZZLE_UP:
    case PUMP_NOZZLE_STATE.DISPENSING:
    case PUMP_NOZZLE_STATE.DISPENSING_PAUSED:
      return STATUS_VARIANT.INFO
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

export const computeBufferSeverity = (args: {
  depth: number
  lastActionAt?: number
  actionLabel: 'read' | 'clear'
  warnDepth: number
  critDepth: number
  warnAgeMs: number
  critAgeMs: number
}): { sev: BufferSeverity; reason?: string } => {
  const now = Date.now()
  const depth = Number(args.depth || 0)

  if (depth >= args.critDepth)
    return { sev: BUFFER_SEVERITY.CRIT, reason: `depth>=${args.critDepth}` }
  if (depth >= args.warnDepth)
    return { sev: BUFFER_SEVERITY.WARN, reason: `depth>=${args.warnDepth}` }

  if (depth > 0) {
    const age = args.lastActionAt
      ? now - args.lastActionAt
      : Number.POSITIVE_INFINITY
    if (age >= args.critAgeMs)
      return {
        sev: BUFFER_SEVERITY.CRIT,
        reason: `no ${args.actionLabel} for ${Math.round(age / 60000)}m`,
      }
    if (age >= args.warnAgeMs)
      return {
        sev: BUFFER_SEVERITY.WARN,
        reason: `no ${args.actionLabel} for ${Math.round(age / 60000)}m`,
      }
  }

  return { sev: BUFFER_SEVERITY.OK }
}

export const sevVariant = (sev: BufferSeverity): BadgeProps['variant'] => {
  switch (sev) {
    case BUFFER_SEVERITY.CRIT:
      return STATUS_VARIANT.ERROR
    case BUFFER_SEVERITY.WARN:
      return STATUS_VARIANT.WARN
    default:
      return STATUS_VARIANT.SUCCESS
  }
}

export const formatState = (state: string) => {
  switch (state) {
    case PUMP_NOZZLE_STATE.PREAUTHORIZED:
      return 'PRE-AUTHORIZED'
    case PUMP_NOZZLE_STATE.NOZZLE_UP:
      return 'NOZZLE UP'
    case PUMP_NOZZLE_STATE.NOZZLE_DOWN:
      return 'NOZZLE DOWN'
    case PUMP_NOZZLE_STATE.DISPENSING_PAUSED:
      return 'DISPENSING PAUSED'
    default:
      return state.replace(/_/g, ' ').toUpperCase();
  }
}

export const formatLastSeen = (value: number | null | undefined) => {
  if (!value) return 'Never'
  return new Date(value).toLocaleTimeString()
}

export const healthVariant = (health?: string): BadgeProps['variant'] => {
  switch (health) {
    case FORECOURT_CONNECTION_STATUS.ONLINE:
      return STATUS_VARIANT.SUCCESS
    case FORECOURT_CONNECTION_STATUS.OFFLINE:
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.WARN
  }
}

export const DEFAULT_THRESHOLDS: BufferThresholds = {
  ...DEFAULT_BUFFER_THRESHOLDS,
}

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

  const nozzle = {
    nozzleId,
    fuelType: undefined,
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
      health: pump.online
        ? FORECOURT_CONNECTION_STATUS.ONLINE
        : FORECOURT_CONNECTION_STATUS.OFFLINE,
    })
  }

  return {
    ...snapshot,
    pumps,
    updatedAt: now,
  }
}
