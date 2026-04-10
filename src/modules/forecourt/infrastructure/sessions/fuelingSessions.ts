export type FuelingStatus = 'idle' | 'dispensing'

export type FuelingSession = {
  stationId: string
  pumpNumber: number
  nozzleNumber: number
  status: FuelingStatus
  startedAt: number
  lastUpdateAt: number
  startVolume: number
  lastVolume: number
  startAmount?: number
  lastAmount?: number
  finalized: boolean
  completionCandidateAt?: number
  completionCandidateProgressAt?: number
  postSaleTotalsAt?: number
}

export type FuelingTransition = 'start' | 'end' | null

type FuelingStateUpdate = {
  stationId: string
  pumpNumber: number
  nozzleNumber: number
  state: string
  volume?: number
  amount?: number
  occurredAt?: number
}

type FuelingMetricUpdate = {
  stationId: string
  pumpNumber: number
  nozzleNumber: number
  volume?: number
  amount?: number
  occurredAt?: number
}

type FuelingStore = {
  sessions: Map<string, FuelingSession>
}

const getStore = (): FuelingStore => {
  const anyGlobal = globalThis as any
  if (!anyGlobal.__vposFuelingSessions) {
    anyGlobal.__vposFuelingSessions = {
      sessions: new Map<string, FuelingSession>(),
    } satisfies FuelingStore
  }
  return anyGlobal.__vposFuelingSessions as FuelingStore
}

const getKey = (stationId: string, pumpNumber: number, nozzleNumber: number) =>
  `${stationId}:${pumpNumber}:${nozzleNumber}`

const normalizeState = (value: string): FuelingStatus | null => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return null
  if (raw.includes('dispens') || raw === 'nozzle_up' || raw === 'up') {
    return 'dispensing'
  }
  if (
    raw.includes('idle') ||
    raw.includes('end') ||
    raw.includes('stop') ||
    raw === 'nozzle_down' ||
    raw === 'down'
  ) {
    return 'idle'
  }
  return null
}

export const getFuelingSession = (
  stationId: string,
  pumpNumber: number,
  nozzleNumber: number,
) => {
  const store = getStore()
  return store.sessions.get(getKey(stationId, pumpNumber, nozzleNumber)) ?? null
}

export const updateFuelingFromState = (
  update: FuelingStateUpdate,
): { session: FuelingSession | null; transition: FuelingTransition } => {
  const status = normalizeState(update.state)
  if (!status) return { session: null, transition: null }

  const store = getStore()
  const key = getKey(update.stationId, update.pumpNumber, update.nozzleNumber)
  const now = update.occurredAt ?? Date.now()
  const existing = store.sessions.get(key)

  if (status === 'dispensing') {
    if (!existing || existing.status !== 'dispensing' || existing.finalized) {
      const session: FuelingSession = {
        stationId: update.stationId,
        pumpNumber: update.pumpNumber,
        nozzleNumber: update.nozzleNumber,
        status: 'dispensing',
        startedAt: now,
        lastUpdateAt: now,
        startVolume: update.volume ?? 0,
        lastVolume: update.volume ?? 0,
        startAmount: update.amount,
        lastAmount: update.amount,
        finalized: false,
      }
      store.sessions.set(key, session)
      return { session, transition: 'start' }
    }

    // sale resumed; invalidate any pending completion candidate
    if (existing.completionCandidateAt != null && !existing.finalized) {
      clearFuelingCompletionCandidate(existing)
    }

    if (update.volume != null) existing.lastVolume = update.volume
    if (update.amount != null) existing.lastAmount = update.amount
    existing.lastUpdateAt = now
    return { session: existing, transition: null }
  }

  if (!existing) return { session: null, transition: null }

  const previousStatus = existing.status
  if (update.volume != null) existing.lastVolume = update.volume
  if (update.amount != null) existing.lastAmount = update.amount
  existing.lastUpdateAt = now
  existing.status = 'idle'

  if (previousStatus === 'dispensing' && !existing.finalized) {
    return { session: existing, transition: 'end' }
  }

  return { session: existing, transition: null }
}

export const updateFuelingMetrics = (update: FuelingMetricUpdate) => {
  const store = getStore()
  const key = getKey(update.stationId, update.pumpNumber, update.nozzleNumber)
  const existing = store.sessions.get(key)
  if (!existing) return null

  const now = update.occurredAt ?? Date.now()
  if (update.volume != null) existing.lastVolume = update.volume
  if (update.amount != null) existing.lastAmount = update.amount
  existing.lastUpdateAt = now

  return existing
}

export const computeDispensedVolume = (session: FuelingSession) => {
  const start = Number.isFinite(session.startVolume) ? session.startVolume : 0
  const last = Number.isFinite(session.lastVolume) ? session.lastVolume : 0
  if (last >= start && start > 0) return last - start
  return last
}

export const computeDispensedAmount = (session: FuelingSession) => {
  if (session.lastAmount == null) return null
  const last = Number(session.lastAmount)
  if (!Number.isFinite(last)) return null
  if (session.startAmount == null) return last
  const start = Number(session.startAmount)
  if (!Number.isFinite(start)) return last
  if (last >= start && start > 0) return last - start
  return last
}

export type FuelingFinalizeConfig = {
  stableIdleMs: number
  stableIdleFallbackMs: number
  postSaleTotalsWaitMs: number
}

export function markFuelingCompletionCandidate(
  session: FuelingSession,
  occurredAt: number,
) {
  if (session.finalized) return
  if (session.completionCandidateAt == null) {
    session.completionCandidateAt = occurredAt
    session.completionCandidateProgressAt = session.lastUpdateAt
  }
}

export function clearFuelingCompletionCandidate(session: FuelingSession) {
  session.completionCandidateAt = undefined
  session.completionCandidateProgressAt = undefined
  session.postSaleTotalsAt = undefined
}

export function notePostSaleTotalsSeen(
  session: FuelingSession,
  occurredAt: number,
) {
  if (session.completionCandidateAt == null) return
  // Only treat totals after candidate time as post-sale totals
  if (occurredAt >= session.completionCandidateAt) {
    session.postSaleTotalsAt = occurredAt
  }
}

export function isFuelingReadyToFinalize(
  session: FuelingSession,
  cfg: FuelingFinalizeConfig,
  now = Date.now(),
) {
  if (session.finalized) return false
  if (session.status !== 'idle') return false
  const candidateAt = session.completionCandidateAt
  if (candidateAt == null) return false

  // If we saw totals after the candidate, use stableIdleMs; otherwise fallback longer
  const hasPostSaleTotals =
    session.postSaleTotalsAt != null &&
    session.postSaleTotalsAt >= candidateAt &&
    session.postSaleTotalsAt - candidateAt <= cfg.postSaleTotalsWaitMs + 10_000

  const stableMs = hasPostSaleTotals
    ? cfg.stableIdleMs
    : cfg.stableIdleFallbackMs
  return now - candidateAt >= stableMs
}

export const cleanupFuelingSessions = (maxAgeMs = 2 * 60 * 60 * 1000) => {
  const store = getStore()
  const now = Date.now()
  for (const [key, session] of store.sessions.entries()) {
    const age = now - session.lastUpdateAt
    if (age > maxAgeMs) {
      store.sessions.delete(key)
    }
  }
}
