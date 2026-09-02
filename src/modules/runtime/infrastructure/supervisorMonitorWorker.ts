import { startStationStorageRetentionWorker } from '@/src/platform/retention/stationStorageRetention'
import { getRuntimeUptimeSeconds } from '@/src/platform/runtime/nodeProcess'
import { getSystemConfiguration } from '@/src/shared/config/loader'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { drainFiscalInbox } from '@/src/modules/fiscal-inbox/application/fiscalInbox'
import {
  startArchiveBusListener,
  startFiscalBusListener,
  startPosBusListener,
} from '@/src/modules/runtime/infrastructure/busListeners'
import { runFiscalAuthTimeoutSweep } from '@/src/modules/runtime/infrastructure/fiscalRecoveryPolicy'
import { SupervisorRuntime } from '@/src/modules/supervisor/infrastructure/supervisorRuntime'

const WORKER_NAME = 'supervisorMonitorWorker'
const DEFAULT_POLL_MS = 5_000
const HEARTBEAT_MS = 5_000

let controller: AbortController | null = null
let retentionHandle: { stop: () => void } | null = null

function stopSupervisorMonitorWorker() {
  controller?.abort()
  retentionHandle?.stop()
  retentionHandle = null
}

export function startSupervisorMonitorWorker(
  stationId: string,
  opts?: { pollMs?: number },
) {
  if (controller && !controller.signal.aborted) {
    return { stop: stopSupervisorMonitorWorker }
  }

  controller = new AbortController()
  const signal = controller.signal
  const pollMs = Math.max(250, Number(opts?.pollMs ?? DEFAULT_POLL_MS))

  startPosBusListener()
  startFiscalBusListener()
  startArchiveBusListener()
  retentionHandle = startStationStorageRetentionWorker(stationId)

  const supervisor = new SupervisorRuntime(stationId)

  void (async () => {
    let lastHeartbeat = 0

    while (!signal.aborted) {
      const now = Date.now()

      if (now - lastHeartbeat > HEARTBEAT_MS) {
        lastHeartbeat = now
        await safeAsync(
          upsertProcessHeartbeat({
            stationId,
            processName: WORKER_NAME,
            pid: process.pid,
            status: 'running',
            connected: true,
            metrics: { uptime: getRuntimeUptimeSeconds() },
          }),
          'supervisorMonitor.heartbeat',
        )
      }

      try {
        const cfg = await getSystemConfiguration(stationId).catch(
          () => null as any,
        )
        const supervisorCfg = cfg?.supervisor ?? {}
        const processConfig: Record<string, any> = cfg?.processes?.process ?? {}

        const status = await supervisor.getStatus().catch(
          () =>
            ({
              processes: {},
            }) as any,
        )
        const processes = status.processes ?? {}

        await safeAsync(
          drainFiscalInbox({ limitPerBatch: 50, maxLoops: 3 }),
          'supervisorMonitor.drainFiscalInbox',
        )

        await safeAsync(
          runFiscalAuthTimeoutSweep({
            stationId,
            supervisor,
            timeoutMs: Number(supervisorCfg?.fiscalAuthTimeoutMs ?? 60_000),
          }),
          'supervisorMonitor.fiscalAuthTimeoutSweep',
        )

        void processConfig
        void processes
      } catch (e: any) {
        await safeAsync(
          upsertProcessHeartbeat({
            stationId,
            processName: WORKER_NAME,
            status: 'OK',
            connected: true,
            metrics: { lastError: e?.message ?? String(e) },
          }),
          'supervisorMonitor.heartbeatOnError',
        )
      }

      await new Promise((r) => setTimeout(r, pollMs))
    }
  })()

  return { stop: stopSupervisorMonitorWorker }
}
