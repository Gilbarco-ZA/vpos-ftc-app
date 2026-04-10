import '@/src/modules/forecourt/infrastructure/jpl/globals'

import {
  getJplAdapterState,
  setJplAdapterState,
} from '@/src/shared/forecourt/jplState'
import { persistAdapterState } from '@/src/shared/forecourt/sharedState'

import { recordForecourtEvent } from '@/src/modules/forecourt/infrastructure/persistence'

export const syncAdapterState = (
  stationId: string,
  next: Partial<ReturnType<typeof getJplAdapterState>>,
) => {
  setJplAdapterState(next)
  const snapshot = getJplAdapterState()
  void persistAdapterState(stationId, snapshot)
}

const getPersistDedupe = () => {
  if (!globalThis.__jplPersistDedupe) {
    globalThis.__jplPersistDedupe = new Map()
  }
  return globalThis.__jplPersistDedupe
}

const shouldPersistEventType = (eventType: string) => {
  if (!eventType) return false
  if (eventType === 'heartbeat_00H') return false
  if (eventType === 'jpl_00H') return false
  return true
}

export const persistJplEventOnce = async (args: {
  stationId: string
  eventType: string
  payload: any
  occurredAt: Date | number | string
}) => {
  const { stationId, eventType, payload, occurredAt } = args
  if (!shouldPersistEventType(eventType)) return

  const dedupe = getPersistDedupe()
  const key = JSON.stringify([
    stationId,
    eventType,
    payload?.FpId ?? null,
    payload?.TransSeqNo ?? null,
    payload?.MoneyDue ?? null,
    payload?.Vol ?? null,
  ])

  const now = Date.now()
  const last = dedupe.get(key) ?? 0
  if (now - last < 3_000) return
  dedupe.set(key, now)

  if (dedupe.size > 5000) {
    for (const [k, ts] of dedupe.entries()) {
      if (now - ts > 60_000) dedupe.delete(k)
    }
  }

  await recordForecourtEvent({
    stationId,
    source: 'jpl_tcp',
    eventType,
    payload,
    occurredAt,
  })
}
