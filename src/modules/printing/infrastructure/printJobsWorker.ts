import type { PrintJobRow } from '@/src/modules/printing/infrastructure/printJobs'

import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'

import { handlePrintJob, resolvePrintJobPrinter } from '@/src/modules/printing/infrastructure/printJobs'
import { printJobsRepo } from '@/src/modules/printing/infrastructure/printJobsRepo'

import { logger } from '@/src/shared/utils/logger'
import { PrinterBackoff } from './printer-backoff'

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

const backoffSeconds = Number(process.env.VPOS_PRINTER_BACKOFF_SECONDS ?? 30)
const BACKOFF_MS = 1000 * (Number.isFinite(backoffSeconds)
  ? Math.max(5, Math.min(300, backoffSeconds)) : 30)

function isPrinterConnectivityError(error: unknown) {
  const text =
    String((error as any)?.code || '') +
    ' ' +
    String((error as any)?.message || error || '')
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENETDOWN|ENOTFOUND|EAI_AGAIN|EPIPE|printer connection timeout|socket hang up|No printer configured \(set device_configs device_type=printer, or pass printerIP\)/i.test(
    text,
  )
}

export function startPrintJobsWorker(opts?: { pollMs?: number }) {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS
  const stationId = getStationId()
  let stopped = false
  const backoff = new PrinterBackoff()

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

        const candidates = await printJobsRepo.listDueForWorker(stationId, backoff.excludedIds())
        let job: PrintJobRow | null = null
        let printer: Awaited<ReturnType<typeof resolvePrintJobPrinter>> = null
        let destination = ''
        for (const candidate of candidates) {
          if (stopped) break
          const resolved = await resolvePrintJobPrinter(candidate)
          if (!resolved?.ip) {
            backoff.defer(candidate.id, performance.now() + BACKOFF_MS)
            continue
          }
          const key = JSON.stringify([resolved.ip, resolved.port ?? 9100])
          const until = backoff.blockedUntil(key)
          if (until > 0) {
            backoff.defer(candidate.id, until)
            continue
          }
          if (stopped) break
          job = await printJobsRepo.claimNextForWorker(stationId, candidate.id, candidate.candidate_version) ?? null
          if (!job) continue
          printer = resolved
          destination = key
          break
        }
        if (!job || !printer) {
          await new Promise((r) => setTimeout(r, pollMs))
          continue
        }

        await upsertProcessHeartbeat({
          stationId: job.station_id,
          processName: 'printJobsWorker',
          status: 'OK',
          connected: true,
          metrics: { lastJobId: job.id },
        }).catch(() => {})

        try {
          getRuntimeBus().publish('printer', {
            type: 'printJobStarted',
            stationId: job.station_id,
            jobId: job.id,
            jobType: job.job_type,
            at: Date.now(),
          })

          await handlePrintJob(job, printer)
          try {
            await printJobsRepo.markDone(job.id)
          } catch {
            // Printing may already have succeeded. Leave the claim for explicit
            // reconciliation rather than automatically delivering a duplicate.
            logger.error('[printJobsWorker]', { msg: 'Print completion persistence failed; reconciliation required', jobId: job.id })
            continue
          }

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
            backoff.fail(destination, BACKOFF_MS)
            await printJobsRepo.holdForConnectivityRetry(
              job.id,
              `${PRINTER_UNAVAILABLE_ERROR_PREFIX} ${msg}`,
              Math.max(CONNECTIVITY_RETRY_SECONDS, BACKOFF_MS / 1000),
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
