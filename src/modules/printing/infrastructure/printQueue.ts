import { queryOne } from '@/src/platform/db/postgres'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  buildReferencePrintJobPayload,
  CANONICAL_PRINT_JOB_TYPES,
  normalizePrintJobType,
} from '@/src/modules/printing/domain/printJobPayload'

export type EnqueuePrintJobOptions = {
  idempotencyKey?: string
  sourceTransactionId?: string
  sourceReportId?: string
  scheduledAt?: Date
  payloadMode?: 'embedded' | 'reference'
}

function preparePayload(
  jobType: string,
  payload: unknown,
  options: EnqueuePrintJobOptions,
) {
  if (options.payloadMode !== 'reference') return payload ?? {}

  if (
    jobType === CANONICAL_PRINT_JOB_TYPES.receipt &&
    !options.sourceTransactionId
  ) {
    throw new Error(
      'Reference-based receipt print jobs require sourceTransactionId',
    )
  }
  if (jobType === CANONICAL_PRINT_JOB_TYPES.report && !options.sourceReportId) {
    throw new Error('Reference-based report print jobs require sourceReportId')
  }
  if (
    jobType !== CANONICAL_PRINT_JOB_TYPES.receipt &&
    jobType !== CANONICAL_PRINT_JOB_TYPES.report
  ) {
    throw new Error(
      `Reference-based payloads are not supported for print job type: ${jobType}`,
    )
  }

  return buildReferencePrintJobPayload(payload)
}

export async function enqueuePrintJob(
  stationId: string,
  jobType: string,
  payload: unknown,
  priority = 0,
  options: EnqueuePrintJobOptions = {},
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const normalizedJobType = normalizePrintJobType(
    requireNonEmptyString(jobType, 'jobType'),
  )
  const { idempotencyKey, sourceTransactionId, sourceReportId, scheduledAt } =
    options
  const storedPayload = preparePayload(normalizedJobType, payload, options)

  if (!idempotencyKey) {
    const jobId = uuidv4()
    const row = await queryOne<{ id: string }>(
      `
      INSERT INTO print_jobs (id, station_id, job_type, payload, priority, source_transaction_id, source_report_id, scheduled_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, COALESCE($8, CURRENT_TIMESTAMP))
      RETURNING id
      `,
      [
        jobId,
        normalizedStationId,
        normalizedJobType,
        JSON.stringify(storedPayload),
        priority,
        sourceTransactionId ?? null,
        sourceReportId ?? null,
        scheduledAt ? scheduledAt.toISOString() : null,
      ],
    )
    return row?.id
  }

  const row = await queryOne<{ id: string }>(
    `
    WITH ins AS (
      INSERT INTO print_jobs (id, station_id, job_type, payload, priority, idempotency_key, source_transaction_id, source_report_id, scheduled_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, COALESCE($9, CURRENT_TIMESTAMP))
      ON CONFLICT (station_id, idempotency_key)
      DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    )
    SELECT id FROM ins
    UNION ALL
    SELECT id FROM print_jobs WHERE station_id = $2 AND idempotency_key = $6
    LIMIT 1
    `,
    [
      uuidv4(),
      normalizedStationId,
      normalizedJobType,
      JSON.stringify(storedPayload),
      priority,
      idempotencyKey,
      sourceTransactionId ?? null,
      sourceReportId ?? null,
      scheduledAt ? scheduledAt.toISOString() : null,
    ],
  )

  return row?.id
}
