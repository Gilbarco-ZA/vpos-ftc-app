import { sendForecourtCommand } from '@/src/shared/forecourt/gateway'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

type Key = string

type PollState = {
  interval?: NodeJS.Timeout
  stationId: string
  pumpNumber: number
  nozzleNumber: number
  startedAt: number
  lastTickAt: number
  mode: 'sale' | 'idle'
}

type Store = {
  pollers: Map<Key, PollState>
}

const getStore = (): Store => {
  const anyGlobal = globalThis as any
  if (!anyGlobal.__forecourtTotalsPollers) {
    anyGlobal.__forecourtTotalsPollers = {
      pollers: new Map<Key, PollState>(),
    } satisfies Store
  }
  return anyGlobal.__forecourtTotalsPollers as Store
}

const keyOf = (stationId: string, pumpNumber: number, nozzleNumber: number) =>
  `${stationId}:${pumpNumber}:${nozzleNumber}`

export type TotalsPollerConfig = {
  salePollingIntervalMs: number
  postSaleTotalsWaitMs: number
}

const readTotals = async (opts: {
  stationId: string
  pumpNumber: number
  nozzleNumber: number
  timeoutMs?: number
}) => {
  const cmd = {
    id: uuidv4(),
    stationId: opts.stationId,
    pumpNumber: opts.pumpNumber,
    nozzleNumber: opts.nozzleNumber,
    action: 'READ_TOTALS',
    payload: {
      pumpNumber: opts.pumpNumber,
      nozzleNumber: opts.nozzleNumber,
      timeoutMs: opts.timeoutMs ?? 5000,
    },
    issuedAt: Date.now(),
  }
  await sendForecourtCommand(cmd)
}

export const startSaleTotalsPolling = (
  cfg: TotalsPollerConfig,
  opts: {
    stationId: string
    pumpNumber: number
    nozzleNumber: number
  },
) => {
  const store = getStore()
  const k = keyOf(opts.stationId, opts.pumpNumber, opts.nozzleNumber)
  const existing = store.pollers.get(k)
  if (existing?.interval) return

  const st: PollState = {
    stationId: opts.stationId,
    pumpNumber: opts.pumpNumber,
    nozzleNumber: opts.nozzleNumber,
    startedAt: Date.now(),
    lastTickAt: 0,
    mode: 'sale',
  }

  st.interval = setInterval(
    () => {
      st.lastTickAt = Date.now()
      readTotals({ ...opts }).catch((err) => {
        // best-effort: do not crash the process
        logger.error('[totals-poller]', {
          msg: 'readTotals failed',
          error: err?.message ?? err,
        })
      })
    },
    Math.max(250, cfg.salePollingIntervalMs),
  )

  store.pollers.set(k, st)
}

export const stopTotalsPolling = (opts: {
  stationId: string
  pumpNumber: number
  nozzleNumber: number
}) => {
  const store = getStore()
  const k = keyOf(opts.stationId, opts.pumpNumber, opts.nozzleNumber)
  const st = store.pollers.get(k)
  if (st?.interval) clearInterval(st.interval)
  store.pollers.delete(k)
}

/**
 * Post-sale refresh:
 * - issue one immediate totals read
 * - keep the existing sale poller running (if present)
 */
export const requestPostSaleTotalsRefresh = async (
  cfg: TotalsPollerConfig,
  opts: { stationId: string; pumpNumber: number; nozzleNumber: number },
) => {
  // immediate request (do not wait for next tick)
  await readTotals({ ...opts, timeoutMs: cfg.postSaleTotalsWaitMs })
}
