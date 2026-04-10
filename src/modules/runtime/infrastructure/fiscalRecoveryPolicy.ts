import type { SupervisorRuntime } from '@/src/modules/supervisor/infrastructure/supervisorRuntime'

import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export type PendingFiscalAuth = {
  id: string
  createdAt: number
  timeoutMs?: number
}

type FiscalRecoveryMeta = {
  windowStartAt?: number
  timeoutCountInWindow?: number
  lastTimeoutAt?: number
  lastRestartAt?: number
  maxTimeouts?: number
  windowMs?: number
  timeoutMs?: number
}

const KEY_PENDING = 'vpos.fiscal.pendingAuth'
const KEY_META = 'vpos.fiscal.meta'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_WINDOW_MS = 5 * 60_000
const DEFAULT_MAX_TIMEOUTS = 3

export async function recordPendingFiscalAuth(
  stationId: string,
  item: PendingFiscalAuth,
) {
  const current =
    (await kvGet<PendingFiscalAuth[]>(stationId, KEY_PENDING)) ?? []
  await kvSet(stationId, KEY_PENDING, [...current, item])
}

export async function clearPendingFiscalAuth(stationId: string, id: string) {
  const current =
    (await kvGet<PendingFiscalAuth[]>(stationId, KEY_PENDING)) ?? []
  await kvSet(
    stationId,
    KEY_PENDING,
    current.filter((x) => x.id !== id),
  )
}

export async function getFiscalRecoveryMeta(
  stationId: string,
): Promise<FiscalRecoveryMeta | null> {
  return (await kvGet<FiscalRecoveryMeta>(stationId, KEY_META)) ?? null
}

async function setFiscalRecoveryMeta(
  stationId: string,
  patch: FiscalRecoveryMeta,
) {
  const current = (await getFiscalRecoveryMeta(stationId)) ?? {}
  await kvSet(stationId, KEY_META, { ...current, ...patch })
}

export async function runFiscalAuthTimeoutSweep(opts: {
  stationId: string
  supervisor: SupervisorRuntime
  now?: number
  timeoutMs?: number
  windowMs?: number
  maxTimeouts?: number
  processName?: string
}) {
  const {
    stationId,
    supervisor,
    now = Date.now(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    windowMs = DEFAULT_WINDOW_MS,
    maxTimeouts = DEFAULT_MAX_TIMEOUTS,
    processName = 'fiscal',
  } = opts

  const pending =
    (await kvGet<PendingFiscalAuth[]>(stationId, KEY_PENDING)) ?? []
  if (!pending.length) {
    await setFiscalRecoveryMeta(stationId, { timeoutMs, windowMs, maxTimeouts })
    return
  }

  const expired: PendingFiscalAuth[] = []
  const remaining: PendingFiscalAuth[] = []
  for (const item of pending) {
    const t = Number(item.timeoutMs ?? timeoutMs)
    const age = now - Number(item.createdAt ?? now)
    if (age > t) expired.push(item)
    else remaining.push(item)
  }

  if (!expired.length) {
    await setFiscalRecoveryMeta(stationId, { timeoutMs, windowMs, maxTimeouts })
    return
  }

  await kvSet(stationId, KEY_PENDING, remaining)

  const bus = getRuntimeBus()
  for (const item of expired) {
    await bus.publish('pos', {
      type: 'fiscalAuthResponse',
      stationId,
      requestId: item.id,
      ok: false,
      error: { code: 'TIMEOUT', message: 'Fiscal auth timed out' },
      at: now,
    })
  }

  const meta = (await getFiscalRecoveryMeta(stationId)) ?? {}
  const windowStartAt =
    typeof meta.windowStartAt === 'number' ? meta.windowStartAt : now

  const inWindow = now - windowStartAt <= windowMs
  const nextWindowStartAt = inWindow ? windowStartAt : now
  const baseCount = inWindow ? Number(meta.timeoutCountInWindow ?? 0) : 0
  const nextCount = baseCount + expired.length

  await setFiscalRecoveryMeta(stationId, {
    windowStartAt: nextWindowStartAt,
    timeoutCountInWindow: nextCount,
    lastTimeoutAt: now,
    timeoutMs,
    windowMs,
    maxTimeouts,
  })

  if (nextCount >= maxTimeouts) {
    try {
      await supervisor.commandProcess(processName, 'restart', {
        reason: 'fiscalAuthTimeout',
        expiredCount: expired.length,
        timeoutCountInWindow: nextCount,
        windowMs,
      })
      await setFiscalRecoveryMeta(stationId, {
        lastRestartAt: now,
        windowStartAt: now,
        timeoutCountInWindow: 0,
      })
    } catch {
      // ignore unsupported process/action combinations
    }
  }
}
