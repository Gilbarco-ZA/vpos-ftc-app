import type { AtgPollingWorkerLock } from '@/src/modules/forecourt/infrastructure/atgPollingWorkerLock'

import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { logger } from '@/src/shared/utils/logger'

import { getAtgPollingSettings } from '@/src/modules/forecourt/application/atgPollingSettings'
import { captureAtgSnapshot } from '@/src/modules/forecourt/application/captureAtgSnapshot'
import { acquireAtgPollingWorkerLock } from '@/src/modules/forecourt/infrastructure/atgPollingWorkerLock'

const WORKER_NAME = 'atgPollingWorker'
const SETTINGS_REFRESH_MS = 10_000
const ERROR_RETRY_MAX_MS = 60_000

export type AtgSnapshotResult = Awaited<ReturnType<typeof captureAtgSnapshot>>

export type AtgPollingWorkerDeps = {
  getSettings: typeof getAtgPollingSettings
  captureSnapshot: typeof captureAtgSnapshot
  publishSnapshot: (
    stationId: string,
    result: AtgSnapshotResult,
  ) => Promise<unknown>
  heartbeat: typeof upsertProcessHeartbeat
  acquireLock: (stationId: string) => Promise<AtgPollingWorkerLock | null>
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const defaultDeps: AtgPollingWorkerDeps = {
  getSettings: getAtgPollingSettings,
  captureSnapshot: captureAtgSnapshot,
  publishSnapshot: async () => ({ skipped: true, reason: 'no_publisher' }),
  heartbeat: upsertProcessHeartbeat,
  acquireLock: acquireAtgPollingWorkerLock,
  now: () => Date.now(),
  sleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)),
}

export async function runAtgPollingWorkerLoop(
  stationId: string,
  options: {
    isStopped: () => boolean
    settingsRefreshMs?: number
    deps?: Partial<AtgPollingWorkerDeps>
  },
) {
  const deps = { ...defaultDeps, ...options.deps }
  const settingsRefreshMs = Math.max(
    1_000,
    options.settingsRefreshMs ?? SETTINGS_REFRESH_MS,
  )
  const lock = await deps.acquireLock(stationId)
  if (!lock) return { acquired: false }

  let nextPollAt = 0
  let lastSuccessAt: string | null = null
  let lastSnapshotsSaved = 0
  let previousEnabled: boolean | null = null
  let previousIntervalMinutes: number | null = null

  try {
    while (!options.isStopped()) {
      let settings: { enabled: boolean; intervalMinutes: number }
      try {
        settings = await deps.getSettings(stationId)
      } catch (error: any) {
        const message = String(error?.message || error)
        await deps
          .heartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'ERROR',
            connected: false,
            metrics: { phase: 'load-settings' },
            lastError: message,
          })
          .catch(() => {})
        await deps.sleep(settingsRefreshMs)
        continue
      }

      const intervalMs = settings.intervalMinutes * 60_000
      const now = deps.now()

      if (
        settings.enabled &&
        previousEnabled === true &&
        previousIntervalMinutes !== null &&
        previousIntervalMinutes !== settings.intervalMinutes
      ) {
        nextPollAt = now + intervalMs
      }

      if (settings.enabled && previousEnabled === false) {
        nextPollAt = 0
      }

      previousEnabled = settings.enabled
      previousIntervalMinutes = settings.intervalMinutes

      if (!settings.enabled) {
        nextPollAt = 0
        await deps
          .heartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'disabled',
            connected: true,
            metrics: {
              enabled: false,
              intervalMinutes: settings.intervalMinutes,
              lastSuccessAt,
              lastSnapshotsSaved,
            },
          })
          .catch(() => {})
        await deps.sleep(settingsRefreshMs)
        continue
      }

      if (nextPollAt > now) {
        await deps
          .heartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'running',
            connected: true,
            metrics: {
              enabled: true,
              intervalMinutes: settings.intervalMinutes,
              nextPollAt: new Date(nextPollAt).toISOString(),
              lastSuccessAt,
              lastSnapshotsSaved,
            },
          })
          .catch(() => {})
        await deps.sleep(Math.min(settingsRefreshMs, nextPollAt - now))
        continue
      }

      try {
        const result = await deps.captureSnapshot(stationId)
        lastSnapshotsSaved = Number(result.snapshotsSaved ?? 0)

        let publication: unknown
        try {
          publication = await deps.publishSnapshot(stationId, result)
        } catch (error: any) {
          const message = String(error?.message || error)
          nextPollAt = deps.now() + intervalMs

          logger.error('[atg-polling-worker]', {
            msg: 'ATG snapshot persisted but proxy publication failed',
            error: message,
          })

          await deps
            .heartbeat({
              stationId,
              processName: WORKER_NAME,
              status: 'degraded',
              connected: true,
              metrics: {
                enabled: true,
                phase: 'publish',
                intervalMinutes: settings.intervalMinutes,
                capturedAt: result.recordedAt,
                lastSuccessAt,
                lastSnapshotsSaved,
                updated: Number(result.updated ?? 0),
                controllerErrorCount: result.controllerErrors.length,
                nextPollAt: new Date(nextPollAt).toISOString(),
              },
              lastError: message,
            })
            .catch(() => {})

          await deps.sleep(settingsRefreshMs)
          continue
        }

        lastSuccessAt = result.recordedAt
        nextPollAt = deps.now() + intervalMs

        await deps
          .heartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'OK',
            connected: true,
            metrics: {
              enabled: true,
              intervalMinutes: settings.intervalMinutes,
              lastSuccessAt,
              lastSnapshotsSaved,
              updated: Number(result.updated ?? 0),
              controllerErrorCount: result.controllerErrors.length,
              publication,
              nextPollAt: new Date(nextPollAt).toISOString(),
            },
            lastError: null,
          })
          .catch(() => {})
      } catch (error: any) {
        const message = String(error?.message || error)
        nextPollAt = deps.now() + Math.min(intervalMs, ERROR_RETRY_MAX_MS)

        logger.error('[atg-polling-worker]', {
          msg: 'ATG snapshot capture failed',
          error: message,
        })

        await deps
          .heartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'ERROR',
            connected: false,
            metrics: {
              enabled: true,
              phase: 'capture',
              intervalMinutes: settings.intervalMinutes,
              lastSuccessAt,
              lastSnapshotsSaved,
              nextPollAt: new Date(nextPollAt).toISOString(),
            },
            lastError: message,
          })
          .catch(() => {})
      }

      await deps.sleep(settingsRefreshMs)
    }

    return { acquired: true }
  } finally {
    await lock.release().catch(() => {})
  }
}

export function startAtgPollingWorker(input: {
  stationId: string
  settingsRefreshMs?: number
  publishSnapshot?: AtgPollingWorkerDeps['publishSnapshot']
}) {
  let stopped = false

  void runAtgPollingWorkerLoop(input.stationId, {
    isStopped: () => stopped,
    settingsRefreshMs: input.settingsRefreshMs,
    deps: input.publishSnapshot
      ? { publishSnapshot: input.publishSnapshot }
      : undefined,
  }).catch((error) => {
    logger.error('[atg-polling-worker]', {
      msg: 'worker loop stopped unexpectedly',
      error: String((error as any)?.message || error),
    })
  })

  return {
    stop: () => {
      stopped = true
    },
  }
}
