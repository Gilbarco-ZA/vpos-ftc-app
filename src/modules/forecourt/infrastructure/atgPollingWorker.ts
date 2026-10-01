import type { AtgPollingWorkerLock } from '@/src/modules/forecourt/infrastructure/atgPollingWorkerLock'

import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { logger } from '@/src/shared/utils/logger'

import { getAtgPollingSettings } from '@/src/modules/forecourt/application/atgPollingSettings'
import { captureAtgSnapshot } from '@/src/modules/forecourt/application/captureAtgSnapshot'
import { acquireAtgPollingWorkerLock } from '@/src/modules/forecourt/infrastructure/atgPollingWorkerLock'

const WORKER_NAME = 'atgPollingWorker'
const SETTINGS_REFRESH_MS = 10_000

export type AtgSnapshotResult = Awaited<ReturnType<typeof captureAtgSnapshot>>

export type AtgPollingWorkerDeps = {
  getSettings: typeof getAtgPollingSettings
  captureSnapshot: typeof captureAtgSnapshot
  publishSnapshot: (
    stationId: string,
    result: AtgSnapshotResult,
  ) => Promise<unknown>
  getFuelPricePollingSettings: (
    stationId: string,
  ) => Promise<{ enabled: boolean }>
  pollFuelPriceChanges: (stationId: string) => Promise<unknown>
  heartbeat: typeof upsertProcessHeartbeat
  acquireLock: (stationId: string) => Promise<AtgPollingWorkerLock | null>
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const defaultDeps: AtgPollingWorkerDeps = {
  getSettings: getAtgPollingSettings,
  captureSnapshot: captureAtgSnapshot,
  publishSnapshot: async () => ({ skipped: true, reason: 'no_publisher' }),
  getFuelPricePollingSettings: async () => ({ enabled: false }),
  pollFuelPriceChanges: async () => ({
    skipped: true,
    reason: 'no_fuel_price_checker',
  }),
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
      let fuelPriceSettings: { enabled: boolean }
      try {
        ;[settings, fuelPriceSettings] = await Promise.all([
          deps.getSettings(stationId),
          deps.getFuelPricePollingSettings(stationId),
        ])
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
      const anyEnabled = settings.enabled || fuelPriceSettings.enabled

      if (
        anyEnabled &&
        previousEnabled === true &&
        previousIntervalMinutes !== null &&
        previousIntervalMinutes !== settings.intervalMinutes
      ) {
        nextPollAt = now + intervalMs
      }

      if (anyEnabled && previousEnabled === false) {
        nextPollAt = 0
      }

      previousEnabled = anyEnabled
      previousIntervalMinutes = settings.intervalMinutes

      if (!anyEnabled) {
        nextPollAt = 0
        await deps
          .heartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'disabled',
            connected: true,
            metrics: {
              enabled: false,
              atgPollingEnabled: false,
              fuelPricePollingEnabled: false,
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

      let captureResult: AtgSnapshotResult | null = null
      let captureError: string | null = null
      let publication: unknown = {
        skipped: true,
        reason: 'atg_polling_disabled',
      }
      let publicationError: string | null = null

      if (settings.enabled) {
        try {
          captureResult = await deps.captureSnapshot(stationId)
          lastSnapshotsSaved = Number(captureResult.snapshotsSaved ?? 0)

          try {
            publication = await deps.publishSnapshot(stationId, captureResult)
          } catch (error: any) {
            publicationError = String(error?.message || error)
            logger.error('[atg-polling-worker]', {
              msg: 'ATG snapshot persisted but proxy publication failed',
              error: publicationError,
            })
          }
        } catch (error: any) {
          captureError = String(error?.message || error)
          logger.error('[atg-polling-worker]', {
            msg: 'ATG snapshot capture failed',
            error: captureError,
          })
        }
      }

      let fuelPriceChanges: unknown = {
        skipped: true,
        reason: 'fuel_price_polling_disabled',
      }
      let fuelPriceError: string | null = null

      if (fuelPriceSettings.enabled) {
        try {
          fuelPriceChanges = await deps.pollFuelPriceChanges(stationId)
        } catch (error: any) {
          fuelPriceError = String(error?.message || error)
          logger.error('[atg-polling-worker]', {
            msg: 'fuel price change check failed',
            error: fuelPriceError,
          })
        }
      }

      if (captureResult) {
        lastSuccessAt = captureResult.recordedAt
      } else if (!settings.enabled && !fuelPriceError) {
        lastSuccessAt = new Date(deps.now()).toISOString()
      }
      nextPollAt = deps.now() + intervalMs

      const cycleErrors = [
        captureError,
        publicationError,
        fuelPriceError,
      ].filter((value): value is string => Boolean(value))

      await deps
        .heartbeat({
          stationId,
          processName: WORKER_NAME,
          status: cycleErrors.length ? 'degraded' : 'OK',
          connected: true,
          metrics: {
            enabled: true,
            atgPollingEnabled: settings.enabled,
            fuelPricePollingEnabled: fuelPriceSettings.enabled,
            phase: captureError
              ? 'capture'
              : publicationError
                ? 'publish'
                : fuelPriceError
                  ? 'fuel-price'
                  : undefined,
            intervalMinutes: settings.intervalMinutes,
            lastSuccessAt,
            lastSnapshotsSaved,
            updated: Number(captureResult?.updated ?? 0),
            controllerErrorCount:
              captureResult?.controllerErrors.length ?? 0,
            publication,
            publicationError,
            fuelPriceChanges,
            nextPollAt: new Date(nextPollAt).toISOString(),
          },
          lastError: cycleErrors.length ? cycleErrors.join('; ') : null,
        })
        .catch(() => {})

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
  getFuelPricePollingSettings?: AtgPollingWorkerDeps['getFuelPricePollingSettings']
  pollFuelPriceChanges?: AtgPollingWorkerDeps['pollFuelPriceChanges']
}) {
  let stopped = false

  void runAtgPollingWorkerLoop(input.stationId, {
    isStopped: () => stopped,
    settingsRefreshMs: input.settingsRefreshMs,
    deps:
      input.publishSnapshot ||
      input.getFuelPricePollingSettings ||
      input.pollFuelPriceChanges
        ? {
            ...(input.publishSnapshot
              ? { publishSnapshot: input.publishSnapshot }
              : {}),
            ...(input.getFuelPricePollingSettings
              ? {
                  getFuelPricePollingSettings:
                    input.getFuelPricePollingSettings,
                }
              : {}),
            ...(input.pollFuelPriceChanges
              ? { pollFuelPriceChanges: input.pollFuelPriceChanges }
              : {}),
          }
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
