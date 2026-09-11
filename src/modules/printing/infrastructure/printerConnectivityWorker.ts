import net from 'net'

import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

import { parsePrinterDeviceConfig } from './printerConfig'
import { printJobsRepo } from './printJobsRepo'

const WORKER_NAME = 'printerConnectivityWorker'
const DEFAULT_POLL_MS = Number(
  process.env.VPOS_PRINTER_CONNECTIVITY_POLL_MS || 5_000,
)
const DEFAULT_TIMEOUT_MS = Number(
  process.env.VPOS_PRINTER_READY_TIMEOUT_MS || 1_500,
)

async function canConnect(input: {
  host: string
  port: number
  timeoutMs: number
}) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection(
      { host: input.host, port: input.port },
      () => {
        socket.end()
        resolve(true)
      },
    )
    let settled = false
    const finish = (connected: boolean) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {}
      resolve(connected)
    }
    socket.setTimeout(input.timeoutMs)
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.once('connect', () => finish(true))
  })
}

export function startPrinterConnectivityWorker(opts?: {
  pollMs?: number
  timeoutMs?: number
}) {
  const stationId = getStationId()
  const pollMs = Math.max(1_000, Number(opts?.pollMs ?? DEFAULT_POLL_MS))
  const timeoutMs = Math.max(250, Number(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  const previous = new Map<string, boolean>()
  let stopped = false
  let tickInFlight = false

  async function tick() {
    if (stopped || tickInFlight) return
    tickInFlight = true
    try {
      const rows = await printJobsRepo.listEnabledPrinterConfigRows(stationId)
      let connectedCount = 0
      let configuredCount = 0
      let releasedJobs = 0
      let autoPrintEnabled: boolean | null = null

      for (const row of rows) {
        const config = parsePrinterDeviceConfig(row.config_json || {})
        if (!config?.host) continue
        configuredCount += 1
        const key = String(row.device_key || config.host)
        const connected = await canConnect({
          host: config.host,
          port: config.port ?? 9100,
          timeoutMs: config.timeoutMs ?? timeoutMs,
        })
        if (connected) connectedCount += 1

        const wasConnected = previous.get(key)
        previous.set(key, connected)
        if (connected && wasConnected !== true) {
          if (autoPrintEnabled == null) {
            autoPrintEnabled = await printJobsRepo.isAutoPrintEnabled(stationId)
          }
          if (autoPrintEnabled) {
            const released =
              await printJobsRepo.releasePendingPrintJobs(stationId)
            releasedJobs += released.length
          }
        }
      }

      const connected = configuredCount === 0 || connectedCount > 0
      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: configuredCount === 0 ? 'idle' : connected ? 'OK' : 'offline',
        connected,
        metrics: {
          pollMs,
          timeoutMs,
          configuredCount,
          connectedCount,
          releasedJobs,
          autoPrintEnabled,
        },
        lastError: null,
      })
    } catch (error: any) {
      const message = String(error?.message || error)
      logger.error(`[${WORKER_NAME}]`, { msg: 'tick failed', error: message })
      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'error',
        connected: false,
        metrics: { pollMs, timeoutMs },
        lastError: message,
      }).catch(() => {})
    } finally {
      tickInFlight = false
    }
  }

  const timer = setInterval(() => void tick(), pollMs)
  timer.unref?.()
  void tick()

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
  }
}
