import type { CommandQueueRecord } from '@/src/modules/forecourt/infrastructure/queue/commandQueue'
import type {
  ForecourtCommand,
  ForecourtCommandResult,
} from '@/src/shared/forecourt/types'

import { sendForecourtCommand } from '@/src/shared/forecourt/gateway'

import {
  loadPending,
  markDead,
  markDone,
  markInflight,
  markPending,
} from '@/src/modules/forecourt/infrastructure/queue/commandQueue'

const MAX_ATTEMPTS = 8
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30_000
const TICK_MS = 2000

const RETRY_SAFE_ACTIONS = new Set([
  'PING',
  'STATUS',
  'GET_STATUS',
  'GET_SNAPSHOT',
  'PUMP_STATE',
  'NOZZLE_STATE',
  'READ_TOTALS',
])

const inflightLocks = new Set<string>()
const resultListeners = new Set<(result: ForecourtCommandResult) => void>()

let processorStarted = false
let processorTimer: NodeJS.Timeout | null = null
let runInProgress = false

const normalizeAction = (action: string) => action.trim().toUpperCase()

const isRetrySafe = (action: string) =>
  RETRY_SAFE_ACTIONS.has(normalizeAction(action))

const calculateBackoff = (attempts: number) => {
  if (attempts <= 0) return 0
  const delay = BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1)
  return Math.min(MAX_DELAY_MS, delay)
}

const emitResult = (result: ForecourtCommandResult) => {
  for (const listener of resultListeners) {
    try {
      listener(result)
    } catch {
      // ignore listener errors
    }
  }
}

const shouldAttemptNow = (record: CommandQueueRecord, now: number) => {
  if (record.attempts >= MAX_ATTEMPTS) return false
  if (!record.lastAttemptAt) return true
  const backoff = calculateBackoff(record.attempts)
  return now - record.lastAttemptAt >= backoff
}

const processRecord = async (record: CommandQueueRecord) => {
  const { command } = record
  const id = command.id

  if (inflightLocks.has(id)) return

  if (record.attempts >= MAX_ATTEMPTS) {
    await markDead(id, 'max attempts exceeded')
    emitResult({
      id,
      stationId: command.stationId,
      pumpNumber: command.pumpNumber,
      nozzleNumber: command.nozzleNumber,
      status: 'failed',
      error: 'max attempts exceeded',
      timestamp: Date.now(),
    })
    return
  }

  if (!isRetrySafe(command.action) && record.attempts >= 1) {
    await markDead(id, 'non-idempotent command not retryable')
    emitResult({
      id,
      stationId: command.stationId,
      pumpNumber: command.pumpNumber,
      nozzleNumber: command.nozzleNumber,
      status: 'failed',
      error: 'non-idempotent command not retryable',
      timestamp: Date.now(),
    })
    return
  }

  inflightLocks.add(id)
  const inflight = await markInflight(id)
  if (!inflight) {
    inflightLocks.delete(id)
    return
  }

  try {
    await sendForecourtCommand(command)
    await markDone(id)
    emitResult({
      id,
      stationId: command.stationId,
      pumpNumber: command.pumpNumber,
      nozzleNumber: command.nozzleNumber,
      status: 'completed',
      timestamp: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Command failed'
    const status = message.toLowerCase().includes('timed out')
      ? 'timeout'
      : 'failed'
    const attempts = inflight?.attempts ?? record.attempts + 1
    const retrySafe = isRetrySafe(command.action)

    if (!retrySafe || attempts >= MAX_ATTEMPTS) {
      await markDead(id, message)
      emitResult({
        id,
        stationId: command.stationId,
        pumpNumber: command.pumpNumber,
        nozzleNumber: command.nozzleNumber,
        status,
        error: message,
        timestamp: Date.now(),
      })
    } else {
      await markPending(id, message)
    }
  } finally {
    inflightLocks.delete(id)
  }
}

const runOnce = async () => {
  if (runInProgress) return
  runInProgress = true
  try {
    const now = Date.now()
    const records = await loadPending()
    for (const record of records) {
      if (!shouldAttemptNow(record, now)) continue
      await processRecord(record)
    }
  } finally {
    runInProgress = false
  }
}

export const triggerForecourtCommandProcessing = () => {
  void runOnce()
}

export const onForecourtCommandResult = (
  handler: (result: ForecourtCommandResult) => void,
) => {
  resultListeners.add(handler)
  return () => {
    resultListeners.delete(handler)
  }
}

export const startForecourtCommandProcessor = () => {
  if (processorStarted) return
  processorStarted = true
  void runOnce()

  processorTimer = setInterval(() => {
    void runOnce()
  }, TICK_MS)
}
