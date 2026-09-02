import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { fail, ok } from '@/src/platform/web/api/response'
import { defineGetRoute, defineMutationRoute } from '@/src/shared/http/defineRoute'
import { createAuditLog } from '@/src/shared/audit/log'
import { enqueuePrintJob } from '@/src/modules/printing/application/enqueuePrintJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PrintJobAction = {
  action?: 'retry' | 'clear'
  jobId?: string
}

const normalizeStatus = (value: string | null) => {
  const status = String(value ?? '').trim().toUpperCase()
  return ['PENDING', 'PROCESSING', 'DONE', 'FAILED'].includes(status)
    ? status
    : null
}

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    const status = normalizeStatus(url.searchParams.get('status'))
    const type = String(url.searchParams.get('type') ?? '').trim()
    const search = String(url.searchParams.get('search') ?? '').trim()
    const limit = Math.max(
      10,
      Math.min(250, Number(url.searchParams.get('limit') ?? 100) || 100),
    )

    const jobs = await queryAll<any>(
      `SELECT id, job_type, status, priority, attempts, max_attempts,
              scheduled_at, started_at, completed_at, last_error,
              source_transaction_id, source_report_id, created_at, updated_at,
              payload->>'printerKey' AS printer_key
         FROM print_jobs
        WHERE station_id = $1::uuid
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text = '' OR job_type = $3)
          AND (
            $4::text = ''
            OR id::text ILIKE '%' || $4 || '%'
            OR job_type ILIKE '%' || $4 || '%'
            OR COALESCE(source_transaction_id::text, '') ILIKE '%' || $4 || '%'
            OR COALESCE(source_report_id::text, '') ILIKE '%' || $4 || '%'
            OR COALESCE(last_error, '') ILIKE '%' || $4 || '%'
          )
        ORDER BY created_at DESC
        LIMIT $5`,
      [user.stationId, status, type, search, limit],
    )

    const summaryRows = await queryAll<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM print_jobs
        WHERE station_id = $1::uuid
        GROUP BY status`,
      [user.stationId],
    )
    const summary = Object.fromEntries(
      ['PENDING', 'PROCESSING', 'DONE', 'FAILED'].map((key) => [
        key,
        Number(summaryRows.find((row) => row.status === key)?.count ?? 0),
      ]),
    )

    return ok({ jobs, summary })
  },
})

export const POST = defineMutationRoute<PrintJobAction>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const action = body.action
    const jobId = String(body.jobId ?? '').trim()
    if (!jobId) return fail('jobId is required', 400)

    const job = await queryOne<any>(
      `SELECT id, job_type, payload, status, priority,
              source_transaction_id, source_report_id
         FROM print_jobs
        WHERE station_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1`,
      [user.stationId, jobId],
    )
    if (!job) return fail('Print job not found', 404)

    if (action === 'retry') {
      if (job.status !== 'FAILED') {
        return fail('Only failed print jobs can be retried', 409)
      }
      const newJobId = await enqueuePrintJob(
        user.stationId,
        job.job_type,
        job.payload ?? {},
        Number(job.priority ?? 0),
        {
          sourceTransactionId: job.source_transaction_id ?? undefined,
          sourceReportId: job.source_report_id ?? undefined,
        },
      )
      await createAuditLog({
        stationId: user.stationId,
        userId: user.id,
        action: 'PRINT_JOB_RETRIED',
        entityType: 'print_jobs',
        entityId: jobId,
        metadata: { newJobId },
      }).catch(() => {})
      return ok({ jobId: newJobId })
    }

    if (action === 'clear') {
      if (!['DONE', 'FAILED'].includes(job.status)) {
        return fail('Only terminal print jobs can be cleared', 409)
      }
      await query(
        `DELETE FROM print_jobs
          WHERE station_id = $1::uuid
            AND id = $2::uuid
            AND status IN ('DONE', 'FAILED')`,
        [user.stationId, jobId],
      )
      await createAuditLog({
        stationId: user.stationId,
        userId: user.id,
        action: 'PRINT_JOB_CLEARED',
        entityType: 'print_jobs',
        entityId: jobId,
        metadata: { status: job.status, jobType: job.job_type },
      }).catch(() => {})
      return ok({ cleared: true })
    }

    return fail('Unsupported print job action', 400)
  },
})
