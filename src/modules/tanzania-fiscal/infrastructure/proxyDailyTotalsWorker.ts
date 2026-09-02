import { query, queryOne } from '@/src/platform/db/postgres'
import { upsertProcessHeartbeat } from '@/src/shared/runtime/heartbeats'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { submitTanzaniaDailyTotalToProxy } from '@/src/modules/transactions/infrastructure/fiscalization/proxyClient'

import type { TanzaniaDailyTotalRequest } from './proxyDailyTotals'
import { isTanzaniaDailyTotalsSendTimeReached } from '../domain/dailyTotalsSchedule'
import { getStationCountryCode, isTanzaniaCountry } from './country'
import { getTanzaniaDailyTotalsScheduleConfig } from './dailyTotalsStore'
import {
  loadTanzaniaDailyTotalRequest,
  previousClosedBusinessDate,
} from './proxyDailyTotals'

const WORKER_NAME = 'tanzaniaDailyTotalsWorker'
const DEFAULT_POLL_MS = 60_000
const CONFIG_WARNING_INTERVAL_MS = 15 * 60_000

declare global {
  var __vposTanzaniaDailyTotalsWorkerController:
    | { stop: () => void }
    | undefined
}

let lastConfigurationWarningAt = 0
let lastConfigurationWarning = ''

const isConfigurationBlock = (message: string) =>
  /opening grossTotal has not been captured|lifetime opening total/i.test(
    message,
  )

type SubmissionRow = {
  id: string
  business_date: string
  request_payload: TanzaniaDailyTotalRequest
  retry_count: number
}

function retryDelayMs(retryCount: number) {
  return Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(retryCount, 8))
}

async function ensureClosedDaySubmission(
  stationId: string,
  businessDate: string,
) {
  const existing = await queryOne<{ id: string; status: string }>(
    `SELECT id::text, status
       FROM tanzania_daily_total_submissions
      WHERE station_id = $1::uuid
        AND business_date = $2::date`,
    [stationId, businessDate],
  )
  if (existing?.status === 'SENT' || existing?.status === 'QUEUED') {
    return existing.id
  }

  const payload = await loadTanzaniaDailyTotalRequest({
    stationId,
    businessDate,
  })
  await query(
    `INSERT INTO tanzania_daily_total_submissions (
       id, station_id, business_date, z_number, status, request_payload
     ) VALUES ($1::uuid, $2::uuid, $3::date, $4, 'PENDING', $5::jsonb)
     ON CONFLICT (station_id, business_date)
     DO UPDATE SET request_payload = EXCLUDED.request_payload,
                   z_number = EXCLUDED.z_number,
                   updated_at = NOW()
     WHERE tanzania_daily_total_submissions.status IN ('PENDING', 'FAILED')`,
    [uuidv4(), stationId, businessDate, payload.zNumber, payload],
  )
  return businessDate
}

async function claimDueSubmission(stationId: string) {
  return await queryOne<SubmissionRow>(
    `WITH due AS (
       SELECT id
         FROM tanzania_daily_total_submissions
        WHERE station_id = $1::uuid
          AND (
            status IN ('PENDING', 'FAILED')
            OR (status = 'SENDING' AND updated_at <= NOW() - INTERVAL '10 minutes')
          )
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY business_date, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE tanzania_daily_total_submissions d
        SET status = 'SENDING',
            updated_at = NOW()
       FROM due
      WHERE d.id = due.id
     RETURNING d.id::text,
               d.business_date::text,
               d.request_payload,
               d.retry_count`,
    [stationId],
  )
}

async function markSent(
  id: string,
  status: 'SENT' | 'QUEUED',
  response: unknown,
  proxyRequestId?: string | null,
) {
  await query(
    `UPDATE tanzania_daily_total_submissions
        SET status = $2,
            response_payload = $3::jsonb,
            proxy_request_id = COALESCE($4, proxy_request_id),
            last_error = NULL,
            next_retry_at = NULL,
            submitted_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [id, status, response ?? {}, proxyRequestId ?? null],
  )
}

async function markFailed(id: string, retryCount: number, error: string) {
  const nextRetryAt = new Date(Date.now() + retryDelayMs(retryCount + 1))
  await query(
    `UPDATE tanzania_daily_total_submissions
        SET status = 'FAILED',
            retry_count = retry_count + 1,
            last_error = $2,
            next_retry_at = $3::timestamptz,
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [id, error.slice(0, 4000), nextRetryAt.toISOString()],
  )
}

function requestIdFromResponse(data: any): string | null {
  const value = data?.requestId ?? data?.queueId ?? data?.id ?? null
  const text = String(value ?? '').trim()
  return text || null
}

async function submitClaimedSubmission(stationId: string, row: SubmissionRow) {
  try {
    const response = await submitTanzaniaDailyTotalToProxy(
      stationId,
      row.request_payload,
      {
        idempotencyKey: `${stationId}:tanzania-daily-total:${row.business_date}`,
      },
    )
    const queued =
      response.data?.queued === true &&
      Boolean(requestIdFromResponse(response.data))
    const responseStatus = String(response.data?.status ?? '')
      .trim()
      .toUpperCase()
    const businessFailure =
      response.data?.error === true ||
      response.data?.success === false ||
      ['FAILED', 'ERROR', 'REJECTED'].includes(responseStatus)

    if (queued) {
      await markSent(
        row.id,
        'QUEUED',
        response.data,
        requestIdFromResponse(response.data),
      )
      return {
        ok: true as const,
        queued: true as const,
        businessDate: row.business_date,
      }
    }
    if (!response.ok || businessFailure) {
      throw new Error(
        `Tanzania daily total rejected: ${response.status} ${JSON.stringify(response.data)}`,
      )
    }

    await markSent(row.id, 'SENT', response.data)
    return {
      ok: true as const,
      queued: false as const,
      businessDate: row.business_date,
    }
  } catch (error: any) {
    const message = String(error?.message || error)
    await markFailed(row.id, Number(row.retry_count ?? 0), message)
    throw error
  }
}

export async function forceSendTanzaniaDailyTotal(
  stationId: string,
  requestedBusinessDate?: string | null,
) {
  const country = await getStationCountryCode(stationId)
  if (!isTanzaniaCountry(country)) {
    return { skipped: true as const, reason: 'station_country_not_tanzania' }
  }

  const schedule = await getTanzaniaDailyTotalsScheduleConfig(stationId)
  const latestClosedBusinessDate = previousClosedBusinessDate(
    new Date(),
    schedule.timezone,
  )
  const businessDate = String(
    requestedBusinessDate || latestClosedBusinessDate,
  ).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('Business date must use YYYY-MM-DD format.')
  }
  if (businessDate > latestClosedBusinessDate) {
    throw new Error(
      `Tanzania daily totals can only be force-sent for a closed business date. Latest closed date is ${latestClosedBusinessDate}.`,
    )
  }

  const payload = await loadTanzaniaDailyTotalRequest({
    stationId,
    businessDate,
  })
  const row = await queryOne<SubmissionRow>(
    `INSERT INTO tanzania_daily_total_submissions (
       id, station_id, business_date, z_number, status, request_payload
     ) VALUES ($1::uuid, $2::uuid, $3::date, $4, 'SENDING', $5::jsonb)
     ON CONFLICT (station_id, business_date)
     DO UPDATE SET z_number = EXCLUDED.z_number,
                   status = 'SENDING',
                   request_payload = EXCLUDED.request_payload,
                   response_payload = NULL,
                   proxy_request_id = NULL,
                   retry_count = 0,
                   next_retry_at = NULL,
                   last_error = NULL,
                   submitted_at = NULL,
                   updated_at = NOW()
     WHERE tanzania_daily_total_submissions.status NOT IN ('SENDING', 'QUEUED')
     RETURNING id::text,
               business_date::text,
               request_payload,
               retry_count`,
    [uuidv4(), stationId, businessDate, payload.zNumber, payload],
  )

  if (!row) {
    const existing = await queryOne<{ status: string }>(
      `SELECT status
         FROM tanzania_daily_total_submissions
        WHERE station_id = $1::uuid
          AND business_date = $2::date`,
      [stationId, businessDate],
    )
    throw new Error(
      `Daily total ${businessDate} cannot be force-sent while its status is ${existing?.status || 'active'}.`,
    )
  }

  return await submitClaimedSubmission(stationId, row)
}

export async function runTanzaniaDailyTotalsOnce(stationId: string) {
  const country = await getStationCountryCode(stationId)
  if (!isTanzaniaCountry(country)) {
    return { skipped: true as const, reason: 'station_country_not_tanzania' }
  }

  let row = await claimDueSubmission(stationId)
  if (!row) {
    const schedule = await getTanzaniaDailyTotalsScheduleConfig(stationId)
    if (
      !isTanzaniaDailyTotalsSendTimeReached({
        now: new Date(),
        timezone: schedule.timezone,
        sendTime: schedule.sendTime,
      })
    ) {
      return {
        skipped: true as const,
        reason: 'scheduled_time_not_reached',
        sendTime: schedule.sendTime,
        timezone: schedule.timezone,
      }
    }

    const businessDate = previousClosedBusinessDate(
      new Date(),
      schedule.timezone,
    )
    await ensureClosedDaySubmission(stationId, businessDate)
    row = await claimDueSubmission(stationId)
  }

  if (!row) return { skipped: true as const, reason: 'no_due_submission' }
  return await submitClaimedSubmission(stationId, row)
}

export function startTanzaniaDailyTotalsWorker(opts?: {
  stationId?: string
  pollMs?: number
}) {
  if (globalThis.__vposTanzaniaDailyTotalsWorkerController) {
    return globalThis.__vposTanzaniaDailyTotalsWorkerController
  }

  const stationId = opts?.stationId || getStationId()
  const pollMs = Math.max(10_000, opts?.pollMs ?? DEFAULT_POLL_MS)
  let stopped = false
  let running = false

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      const result = await runTanzaniaDailyTotalsOnce(stationId)
      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: 'running',
        connected: true,
        metrics: result,
      })
    } catch (error: unknown) {
      const serialized = serializeError(error)
      const message = serialized.message || String(error)
      const configurationBlocked = isConfigurationBlock(message)
      const now = Date.now()

      if (configurationBlocked) {
        if (
          message !== lastConfigurationWarning ||
          now - lastConfigurationWarningAt >= CONFIG_WARNING_INTERVAL_MS
        ) {
          lastConfigurationWarning = message
          lastConfigurationWarningAt = now
          logger.info(`[${WORKER_NAME}] configuration required`, {
            stationId,
            message,
          })
        }
      } else {
        logger.error(`[${WORKER_NAME}] tick failed`, {
          stationId,
          error: serialized,
        })
      }

      await upsertProcessHeartbeat({
        stationId,
        processName: WORKER_NAME,
        pid: process.pid,
        status: configurationBlocked ? 'waiting_configuration' : 'degraded',
        connected: true,
        metrics: configurationBlocked
          ? { blocked: true, reason: 'configuration_required' }
          : {},
        lastError: configurationBlocked ? null : message,
      }).catch(() => {})
    } finally {
      running = false
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), pollMs)
  timer.unref?.()

  const controller = {
    stop: () => {
      stopped = true
      clearInterval(timer)
      if (globalThis.__vposTanzaniaDailyTotalsWorkerController === controller) {
        globalThis.__vposTanzaniaDailyTotalsWorkerController = undefined
      }
    },
  }
  globalThis.__vposTanzaniaDailyTotalsWorkerController = controller
  return controller
}
