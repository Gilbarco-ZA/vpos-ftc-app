import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'

import { getForecourtSyncConfig, runForecourtConfigSync } from './service'

const DEFAULT_POLL_MS = Number(
  process.env.FORECOURT_SYNC_POLL_MS || 10 * 60_000,
)

export function startForecourtConfigSyncWorker(opts?: { pollMs?: number }) {
  const pollMs = Math.max(60_000, opts?.pollMs ?? DEFAULT_POLL_MS)
  const stationId = getStationId()
  let stopped = false

  const loop = async () => {
    while (!stopped) {
      try {
        await upsertProcessHeartbeat({
          stationId,
          processName: 'forecourtConfigSyncWorker',
          status: 'running',
          connected: true,
          metrics: { pollMs },
        }).catch(() => {})

        const cfg = await getForecourtSyncConfig(stationId)
        if (!cfg?.enabled) {
          await new Promise((r) => setTimeout(r, pollMs))
          continue
        }

        const res = await runForecourtConfigSync({
          stationId,
          force: false,
          includeTankStatus: true,
        })

        await upsertProcessHeartbeat({
          stationId,
          processName: 'forecourtConfigSyncWorker',
          status: res.ok ? 'OK' : 'ERROR',
          connected: true,
          metrics: {
            pollMs,
            lastResult: res.ok ? 'ok' : 'error',
            lastError: res.error,
          },
        }).catch(() => {})
      } catch (err: any) {
        await upsertProcessHeartbeat({
          stationId,
          processName: 'forecourtConfigSyncWorker',
          status: 'ERROR',
          connected: false,
          metrics: { pollMs },
          lastError: err?.message || String(err),
        }).catch(() => {})
      }

      await new Promise((r) => setTimeout(r, pollMs))
    }
  }

  loop()

  return {
    stop: () => {
      stopped = true
    },
  }
}
