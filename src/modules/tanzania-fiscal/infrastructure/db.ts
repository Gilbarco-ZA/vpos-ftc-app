import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export async function upsertEwuraRegistrationPending(args: {
  stationId: string
  payload: any
}) {
  const existing = await queryOne<{ id: string }>(
    `SELECT id
       FROM ewura_registration
      WHERE station_id = $1
      LIMIT 1`,
    [args.stationId],
  )

  if (existing?.id) {
    await query(
      `UPDATE ewura_registration
          SET status = CASE
                         WHEN status = 'SENT'
                         THEN status
                         ELSE 'PENDING'
                       END,
              registration_json = $3::jsonb,
              updated_at = NOW()
        WHERE station_id = $1 AND id = $2`,
      [args.stationId, existing.id, JSON.stringify(args.payload ?? {})],
    )
    return existing
  }

  return await queryOne<{ id: string }>(
    `INSERT INTO ewura_registration (
        id, station_id, status, registration_json
      )
      VALUES ($1, $2, 'PENDING', $3::jsonb)
      RETURNING id`,
    [uuidv4(), args.stationId, JSON.stringify(args.payload ?? {})],
  )
}

export async function markEwuraRegistrationSent(args: {
  stationId: string
  id: string
  response: any
}) {
  await query(
    `UPDATE ewura_registration
        SET status = 'SENT',
            registered_at = COALESCE(registered_at, NOW()),
            sent_at = COALESCE(sent_at, NOW()),
            next_attempt_at = NULL,
            processing_started_at = NULL,
            last_error = NULL,
            registration_json = jsonb_set(
              COALESCE(registration_json, '{}'::jsonb),
              '{response}',
              $3::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [args.stationId, args.id, JSON.stringify(args.response ?? null)],
  )
}

export async function markEwuraRegistrationFailed(args: {
  stationId: string
  id: string
  error: string
  response?: any
}) {
  await query(
    `UPDATE ewura_registration
        SET status = 'FAILED',
            retry_count = COALESCE(retry_count, 0) + 1,
            next_attempt_at = COALESCE(next_attempt_at, NOW() + INTERVAL '1 minute'),
            processing_started_at = NULL,
            last_error = $3,
            registration_json = jsonb_set(
              jsonb_set(
                COALESCE(registration_json, '{}'::jsonb),
                '{error}',
                to_jsonb($3::text),
                true
              ),
              '{response}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.error,
      JSON.stringify(args.response ?? null),
    ],
  )
}

export async function upsertEwuraTransactionPending(args: {
  stationId: string
  transactionId: string
  payload: any
}) {
  const { stationId, transactionId, payload } = args
  return await queryOne<{ id: string }>(
    `INSERT INTO ewura_transactions (
        id, station_id, transaction_id, status, payload_json
      )
      VALUES ($1, $2, $3, 'PENDING', $4::jsonb)
      ON CONFLICT (station_id, transaction_id)
      DO UPDATE SET status = CASE
                               WHEN ewura_transactions.status = 'SENT'
                               THEN ewura_transactions.status
                               ELSE 'PENDING'
                             END,
                    payload_json = EXCLUDED.payload_json,
                    updated_at = NOW()
      RETURNING id`,
    [uuidv4(), stationId, transactionId, JSON.stringify(payload ?? {})],
  )
}

export async function upsertEwuraCreditNotePending(args: {
  stationId: string
  creditNoteId: string
  originalTransactionId: string
  payload: any
}) {
  const { stationId, creditNoteId, originalTransactionId, payload } = args
  return await queryOne<{ id: string }>(
    `INSERT INTO ewura_transactions (
        id, station_id, transaction_id, source_queue_id, status, payload_json
      )
      VALUES ($1, $2, NULL, $3::uuid, 'PENDING', $4::jsonb)
      ON CONFLICT (station_id, source_queue_id)
      DO UPDATE SET status = CASE
                               WHEN ewura_transactions.status = 'SENT'
                               THEN ewura_transactions.status
                               ELSE 'PENDING'
                             END,
                    payload_json = EXCLUDED.payload_json,
                    updated_at = NOW()
      RETURNING id`,
    [
      uuidv4(),
      stationId,
      creditNoteId,
      JSON.stringify({
        ...(payload ?? {}),
        creditNoteId,
        originalTransactionId,
      }),
    ],
  )
}

export async function markEwuraTransactionSent(args: {
  stationId: string
  id: string
  reference?: string | null
  response: any
}) {
  await query(
    `UPDATE ewura_transactions
        SET status = 'SENT',
            sent_at = COALESCE(sent_at, NOW()),
            next_attempt_at = NULL,
            processing_started_at = NULL,
            last_error = NULL,
            ewura_reference = COALESCE($3, ewura_reference),
            payload_json = jsonb_set(
              COALESCE(payload_json, '{}'::jsonb),
              '{response}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.reference ?? null,
      JSON.stringify(args.response),
    ],
  )
}

export async function markEwuraTransactionFailed(args: {
  stationId: string
  id: string
  error: string
  response?: any
}) {
  await query(
    `UPDATE ewura_transactions
        SET status = 'FAILED',
            retry_count = COALESCE(retry_count, 0) + 1,
            next_attempt_at = COALESCE(next_attempt_at, NOW() + INTERVAL '1 minute'),
            processing_started_at = NULL,
            last_error = $3,
            payload_json = jsonb_set(
              jsonb_set(
                COALESCE(payload_json, '{}'::jsonb),
                '{error}',
                to_jsonb($3::text),
                true
              ),
              '{response}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.error,
      JSON.stringify(args.response ?? null),
    ],
  )
}

export async function upsertEwuraReportPending(args: {
  stationId: string
  reportDate: string | null
  sourceQueueId: string | null
  payload: any
}) {
  const { stationId, reportDate, sourceQueueId, payload } = args
  return await queryOne<{ id: string }>(
    `INSERT INTO ewura_reports (
        id, station_id, report_date, source_queue_id, status, payload_json
      )
      VALUES ($1, $2, $3::date, $4, 'PENDING', $5::jsonb)
      ON CONFLICT (station_id, source_queue_id)
      DO UPDATE SET report_date = COALESCE(EXCLUDED.report_date, ewura_reports.report_date),
                    status = CASE
                               WHEN ewura_reports.status = 'SENT'
                               THEN ewura_reports.status
                               ELSE 'PENDING'
                             END,
                    payload_json = EXCLUDED.payload_json,
                    updated_at = NOW()
      RETURNING id`,
    [
      uuidv4(),
      stationId,
      reportDate,
      sourceQueueId,
      JSON.stringify({ ...(payload ?? {}), sourceQueueId }),
    ],
  )
}

export async function markEwuraReportSent(args: {
  stationId: string
  id: string
  reference?: string | null
  response: any
}) {
  await query(
    `UPDATE ewura_reports
        SET status = 'SENT',
            sent_at = COALESCE(sent_at, NOW()),
            next_attempt_at = NULL,
            processing_started_at = NULL,
            last_error = NULL,
            ewura_reference = COALESCE($3, ewura_reference),
            payload_json = jsonb_set(
              COALESCE(payload_json, '{}'::jsonb),
              '{response}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.reference ?? null,
      JSON.stringify(args.response),
    ],
  )
}

export async function markEwuraReportFailed(args: {
  stationId: string
  id: string
  error: string
  response?: any
}) {
  await query(
    `UPDATE ewura_reports
        SET status = 'FAILED',
            retry_count = COALESCE(retry_count, 0) + 1,
            next_attempt_at = COALESCE(next_attempt_at, NOW() + INTERVAL '1 minute'),
            processing_started_at = NULL,
            last_error = $3,
            payload_json = jsonb_set(
              jsonb_set(
                COALESCE(payload_json, '{}'::jsonb),
                '{error}',
                to_jsonb($3::text),
                true
              ),
              '{response}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.error,
      JSON.stringify(args.response ?? null),
    ],
  )
}

export async function upsertTraReportPending(args: {
  stationId: string
  reportDate: string
  sourceQueueId?: string | null
  payload: any
}) {
  const existing = await queryOne<{ id: string }>(
    `SELECT id
       FROM reports
      WHERE station_id = $1
        AND report_type = 'TZ_TRA_Z_REPORT'
        AND report_date_time::date = $2::date
        AND status IN ('PENDING', 'FAILED')
      ORDER BY updated_at DESC
      LIMIT 1`,
    [args.stationId, args.reportDate],
  )

  if (existing?.id) {
    await query(
      `UPDATE reports
          SET payload = $3::jsonb,
              status = 'PENDING',
              source_queue_id = COALESCE($4::uuid, source_queue_id),
              updated_at = NOW()
        WHERE station_id = $1 AND id = $2`,
      [
        args.stationId,
        existing.id,
        JSON.stringify(args.payload ?? {}),
        args.sourceQueueId ?? null,
      ],
    )
    return existing
  }

  return await queryOne<{ id: string }>(
    `INSERT INTO reports (
        id, station_id, report_date_time, report_type, payload, status,
        source_queue_id
      )
      VALUES ($1, $2, $3::date, 'TZ_TRA_Z_REPORT', $4::jsonb, 'PENDING', $5::uuid)
      RETURNING id`,
    [
      uuidv4(),
      args.stationId,
      args.reportDate,
      JSON.stringify(args.payload ?? {}),
      args.sourceQueueId ?? null,
    ],
  )
}

export async function markTraReportSent(args: {
  stationId: string
  id: string
  reference?: string | null
  response: any
}) {
  await query(
    `UPDATE reports
        SET status = 'COMPLETED',
            payload = jsonb_set(
              jsonb_set(
                COALESCE(payload, '{}'::jsonb),
                '{response}',
                $4::jsonb,
                true
              ),
              '{reference}',
              to_jsonb($3::text),
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.reference ?? null,
      JSON.stringify(args.response ?? null),
    ],
  )
}

export async function markTraReportFailed(args: {
  stationId: string
  id: string
  error: string
  response?: any
}) {
  await query(
    `UPDATE reports
        SET status = 'FAILED',
            payload = jsonb_set(
              jsonb_set(
                COALESCE(payload, '{}'::jsonb),
                '{error}',
                to_jsonb($3::text),
                true
              ),
              '{response}',
              $4::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE station_id = $1 AND id = $2`,
    [
      args.stationId,
      args.id,
      args.error,
      JSON.stringify(args.response ?? null),
    ],
  )
}

export type EwuraQueueTable = 'ewura_transactions' | 'ewura_reports'

export type EwuraRetryRow = {
  id: string
  station_id: string
  transaction_id?: string | null
  report_date?: string | null
  source_queue_id?: string | null
  ewura_reference?: string | null
  status: string
  payload_json: any
  retry_count: number
  next_attempt_at?: string | null
  last_error?: string | null
}

export async function claimReadyEwuraTransactions(args: {
  stationId?: string | null
  limit: number
  maxAttempts: number
}) {
  return await queryAll<EwuraRetryRow>(
    `WITH ready AS (
       SELECT id
         FROM ewura_transactions
        WHERE ($1::uuid IS NULL OR station_id = $1::uuid)
          AND status IN ('PENDING', 'FAILED')
          AND COALESCE(retry_count, 0) < $2::int
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY updated_at ASC, created_at ASC
        LIMIT $3::int
        FOR UPDATE SKIP LOCKED
     )
     UPDATE ewura_transactions e
        SET status = 'PROCESSING',
            processing_started_at = NOW(),
            updated_at = NOW()
       FROM ready
      WHERE e.id = ready.id
      RETURNING e.id,
                e.station_id,
                e.transaction_id,
                e.source_queue_id,
                e.ewura_reference,
                e.status,
                e.payload_json,
                COALESCE(e.retry_count, 0) AS retry_count,
                e.next_attempt_at,
                e.last_error`,
    [args.stationId ?? null, args.maxAttempts, args.limit],
  )
}

export async function claimReadyEwuraReports(args: {
  stationId?: string | null
  limit: number
  maxAttempts: number
}) {
  return await queryAll<EwuraRetryRow>(
    `WITH ready AS (
       SELECT id
         FROM ewura_reports
        WHERE ($1::uuid IS NULL OR station_id = $1::uuid)
          AND status IN ('PENDING', 'FAILED')
          AND COALESCE(retry_count, 0) < $2::int
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY updated_at ASC, created_at ASC
        LIMIT $3::int
        FOR UPDATE SKIP LOCKED
     )
     UPDATE ewura_reports e
        SET status = 'PROCESSING',
            processing_started_at = NOW(),
            updated_at = NOW()
       FROM ready
      WHERE e.id = ready.id
      RETURNING e.id,
                e.station_id,
                e.report_date,
                e.source_queue_id,
                e.ewura_reference,
                e.status,
                e.payload_json,
                COALESCE(e.retry_count, 0) AS retry_count,
                e.next_attempt_at,
                e.last_error`,
    [args.stationId ?? null, args.maxAttempts, args.limit],
  )
}

export async function markEwuraRetryScheduled(args: {
  table: EwuraQueueTable
  stationId: string
  id: string
  error: string
  response?: any
  retryable: boolean
  nextAttemptAt: Date | null
  maxAttempts: number
}) {
  const sql =
    args.table === 'ewura_transactions'
      ? `UPDATE ewura_transactions
            SET status = 'FAILED',
                retry_count = CASE
                                WHEN $5::boolean THEN COALESCE(retry_count, 0) + 1
                                ELSE $7::int
                              END,
                next_attempt_at = CASE
                                    WHEN $5::boolean THEN $6::timestamptz
                                    ELSE NULL
                                  END,
                processing_started_at = NULL,
                last_error = $3,
                payload_json = jsonb_set(
                  jsonb_set(
                    COALESCE(payload_json, '{}'::jsonb),
                    '{error}',
                    to_jsonb($3::text),
                    true
                  ),
                  '{response}',
                  $4::jsonb,
                  true
                ),
                updated_at = NOW()
          WHERE station_id = $1 AND id = $2`
      : `UPDATE ewura_reports
            SET status = 'FAILED',
                retry_count = CASE
                                WHEN $5::boolean THEN COALESCE(retry_count, 0) + 1
                                ELSE $7::int
                              END,
                next_attempt_at = CASE
                                    WHEN $5::boolean THEN $6::timestamptz
                                    ELSE NULL
                                  END,
                processing_started_at = NULL,
                last_error = $3,
                payload_json = jsonb_set(
                  jsonb_set(
                    COALESCE(payload_json, '{}'::jsonb),
                    '{error}',
                    to_jsonb($3::text),
                    true
                  ),
                  '{response}',
                  $4::jsonb,
                  true
                ),
                updated_at = NOW()
          WHERE station_id = $1 AND id = $2`

  await query(sql, [
    args.stationId,
    args.id,
    args.error,
    JSON.stringify(args.response ?? null),
    args.retryable,
    args.nextAttemptAt,
    args.maxAttempts,
  ])
}

export async function getEwuraQueueHealth(args: { stationId: string }) {
  const rows = await queryAll<{
    queue: string
    pending: number
    processing: number
    failed: number
    sent: number
    overdue: number
    max_retry_count: number
    last_error: string | null
  }>(
    `WITH q AS (
       SELECT 'transactions'::text AS queue,
              status,
              COALESCE(retry_count, 0) AS retry_count,
              next_attempt_at,
              last_error,
              updated_at
         FROM ewura_transactions
        WHERE station_id = $1
       UNION ALL
       SELECT 'reports'::text AS queue,
              status,
              COALESCE(retry_count, 0) AS retry_count,
              next_attempt_at,
              last_error,
              updated_at
         FROM ewura_reports
        WHERE station_id = $1
     ), latest_error AS (
       SELECT DISTINCT ON (queue) queue, last_error
         FROM q
        WHERE last_error IS NOT NULL
        ORDER BY queue, updated_at DESC
     )
     SELECT q.queue,
            COUNT(*) FILTER (WHERE q.status = 'PENDING')::int AS pending,
            COUNT(*) FILTER (WHERE q.status = 'PROCESSING')::int AS processing,
            COUNT(*) FILTER (WHERE q.status = 'FAILED')::int AS failed,
            COUNT(*) FILTER (WHERE q.status = 'SENT')::int AS sent,
            COUNT(*) FILTER (
              WHERE q.status IN ('PENDING', 'FAILED')
                AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= NOW())
            )::int AS overdue,
            COALESCE(MAX(q.retry_count), 0)::int AS max_retry_count,
            le.last_error
       FROM q
       LEFT JOIN latest_error le ON le.queue = q.queue
      GROUP BY q.queue, le.last_error
      ORDER BY q.queue ASC`,
    [args.stationId],
  )

  return rows
}
