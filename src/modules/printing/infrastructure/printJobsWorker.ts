import type { PrintJobRow } from '@/src/modules/printing/infrastructure/printJobs'

import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'

import { handlePrintJob } from '@/src/modules/printing/infrastructure/printJobs'
import { printJobsRepo } from '@/src/modules/printing/infrastructure/printJobsRepo'

const DEFAULT_POLL_MS = Number(
  process.env.VPOS_PRINT_WORKER_POLL_MS ||
    process.env.VPOS_WORKER_POLL_MS ||
    500,
)
const CONNECTIVITY_RETRY_SECONDS = Math.max(
  1,
  Number(process.env.VPOS_PRINTER_CONNECTIVITY_RETRY_SECONDS || 5),
)
const PRINTER_UNAVAILABLE_ERROR_PREFIX = 'PRINTER_UNAVAILABLE:'

async function claimNextJob(stationId: string): Promise<PrintJobRow | null> {
  return (await printJobsRepo.claimNextForWorker(stationId)) ?? null
}

function isPrinterConnectivityError(error: unknown) {
  const text =
    String((error as any)?.code || '') +
    ' ' +
    String((error as any)?.message || error || '')
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENETDOWN|ENOTFOUND|EAI_AGAIN|EPIPE|printer connection timeout|socket hang up/i.test(
    text,
  )
}

export function startPrintJobsWorker(opts?: { pollMs?: number }) {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS
  const stationId = getStationId()
  let stopped = false

  const loop = async () => {
    while (!stopped) {
      try {
        await upsertProcessHeartbeat({
          stationId,
          processName: 'printJobsWorker',
          status: 'running',
          connected: true,
          metrics: { pollMs },
        }).catch(() => {})

        const job = await claimNextJob(stationId)
        if (!job) {
          await new Promise((r) => setTimeout(r, pollMs))
          continue
        }

        await upsertProcessHeartbeat({
          stationId: job.station_id,
          processName: 'printJobsWorker',
          status: 'OK',
          connected: true,
          metrics: { lastJobId: job.id },
        })

        try {
          getRuntimeBus().publish('printer', {
            type: 'printJobStarted',
            stationId: job.station_id,
            jobId: job.id,
            jobType: job.job_type,
            at: Date.now(),
          })

          await handlePrintJob(job)
          await printJobsRepo.markDone(job.id)

          getRuntimeBus().publish('printer', {
            type: 'printJobDone',
            stationId: job.station_id,
            jobId: job.id,
            jobType: job.job_type,
            at: Date.now(),
          })
        } catch (e: any) {
          const msg = e?.message || String(e) || 'Unknown error'
          const connectivityError = isPrinterConnectivityError(e)
          if (connectivityError) {
            await printJobsRepo.holdForConnectivityRetry(
              job.id,
              `${PRINTER_UNAVAILABLE_ERROR_PREFIX} ${msg}`,
              CONNECTIVITY_RETRY_SECONDS,
            )
          } else {
            await printJobsRepo.scheduleRetry(
              job.id,
              msg,
              job.attempts ?? 0,
              job.max_attempts ?? 3,
            )
          }

          getRuntimeBus().publish('printer', {
            type: 'printJobFailed',
            stationId: job.station_id,
            jobId: job.id,
            jobType: job.job_type,
            error: msg,
            attempts: job.attempts,
            maxAttempts: job.max_attempts,
            connectivityError,
            at: Date.now(),
          })
          await upsertProcessHeartbeat({
            stationId: job.station_id,
            processName: 'printJobsWorker',
            status: connectivityError ? 'waiting-for-printer' : 'OK',
            connected: !connectivityError,
            metrics: {
              lastError: msg,
              connectivityError,
              lastJobId: job.id,
            },
          })
        }
      } catch {
        await new Promise((r) => setTimeout(r, Math.max(1000, pollMs)))
      }
    }
  }

  loop()

  return {
    stop: () => {
      stopped = true
    },
  }
}
