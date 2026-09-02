import { createAuditLog } from '@/src/shared/audit/log'

import { enqueuePrintJob } from './enqueuePrintJob'
import { printJobsRepo } from '../infrastructure/printJobsRepo'

const STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'FAILED'] as const

type AdminPrintJobAction = 'retry' | 'clear'

export function normalizePrintJobStatus(value: string | null) {
  const status = String(value ?? '').trim().toUpperCase()
  return STATUSES.includes(status as (typeof STATUSES)[number]) ? status : null
}

export async function listAdminPrintJobs(args: {
  stationId: string
  status?: string | null
  type?: string
  search?: string
  limit?: number
}) {
  const status = normalizePrintJobStatus(args.status ?? null)
  const type = String(args.type ?? '').trim()
  const search = String(args.search ?? '').trim()
  const limit = Math.max(10, Math.min(250, Number(args.limit ?? 100) || 100))

  const [jobs, summaryRows] = await Promise.all([
    printJobsRepo.listAdminPrintJobs(args.stationId, status, type, search, limit),
    printJobsRepo.listAdminPrintJobStatusCounts(args.stationId),
  ])

  const summary = Object.fromEntries(
    STATUSES.map((key) => [
      key,
      Number(summaryRows.find((row) => row.status === key)?.count ?? 0),
    ]),
  )

  return { jobs, summary }
}

export async function runAdminPrintJobAction(args: {
  stationId: string
  userId: string
  jobId: string
  action?: AdminPrintJobAction
}) {
  const jobId = String(args.jobId ?? '').trim()
  if (!jobId) return { ok: false as const, status: 400, error: 'jobId is required' }

  const job = await printJobsRepo.getAdminPrintJob(args.stationId, jobId)
  if (!job) return { ok: false as const, status: 404, error: 'Print job not found' }

  if (args.action === 'retry') {
    if (job.status !== 'FAILED') {
      return {
        ok: false as const,
        status: 409,
        error: 'Only failed print jobs can be retried',
      }
    }

    const newJobId = await enqueuePrintJob(
      args.stationId,
      job.job_type,
      job.payload ?? {},
      Number(job.priority ?? 0),
      {
        sourceTransactionId: job.source_transaction_id ?? undefined,
        sourceReportId: job.source_report_id ?? undefined,
      },
    )

    await createAuditLog({
      stationId: args.stationId,
      userId: args.userId,
      action: 'PRINT_JOB_RETRIED',
      entityType: 'print_jobs',
      entityId: jobId,
      metadata: { newJobId },
    }).catch(() => {})

    return { ok: true as const, data: { jobId: newJobId } }
  }

  if (args.action === 'clear') {
    if (!['DONE', 'FAILED'].includes(job.status)) {
      return {
        ok: false as const,
        status: 409,
        error: 'Only terminal print jobs can be cleared',
      }
    }

    await printJobsRepo.clearTerminalAdminPrintJob(args.stationId, jobId)
    await createAuditLog({
      stationId: args.stationId,
      userId: args.userId,
      action: 'PRINT_JOB_CLEARED',
      entityType: 'print_jobs',
      entityId: jobId,
      metadata: { status: job.status, jobType: job.job_type },
    }).catch(() => {})

    return { ok: true as const, data: { cleared: true } }
  }

  return { ok: false as const, status: 400, error: 'Unsupported print job action' }
}
