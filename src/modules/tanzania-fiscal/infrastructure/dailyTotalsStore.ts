import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import type { TanzaniaDailyTotalRequest } from './proxyDailyTotals'
import {
  DEFAULT_TANZANIA_DAILY_TOTALS_SEND_TIME,
  normalizeTanzaniaDailyTotalsSendTime,
} from '../domain/dailyTotalsSchedule'

export type TanzaniaDailyTotalSubmissionStatus =
  | 'PENDING'
  | 'SENDING'
  | 'QUEUED'
  | 'SENT'
  | 'FAILED'

export type TanzaniaDailyTotalSubmissionHistoryItem = {
  id: string
  businessDate: string
  zNumber: string
  status: TanzaniaDailyTotalSubmissionStatus
  requestPayload: TanzaniaDailyTotalRequest
  responsePayload: unknown
  proxyRequestId: string | null
  retryCount: number
  nextRetryAt: string | null
  lastError: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TanzaniaDailyTotalsScheduleConfig = {
  timezone: string
  sendTime: string
}

type ScheduleRow = {
  timezone: string
  send_time: string | null
}

type SubmissionHistoryRow = {
  id: string
  business_date: string
  z_number: string
  status: TanzaniaDailyTotalSubmissionStatus
  request_payload: TanzaniaDailyTotalRequest
  response_payload: unknown
  proxy_request_id: string | null
  retry_count: number
  next_retry_at: string | Date | null
  last_error: string | null
  submitted_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

const isoOrNull = (value: string | Date | null) =>
  value == null ? null : new Date(value).toISOString()

export async function getTanzaniaDailyTotalsScheduleConfig(
  stationId: string,
): Promise<TanzaniaDailyTotalsScheduleConfig> {
  const row = await queryOne<ScheduleRow>(
    `SELECT COALESCE(
              NULLIF(BTRIM(fs.timezone), ''),
              'Africa/Dar_es_Salaam'
            ) AS timezone,
            COALESCE(
              TO_CHAR(ss.tanzania_daily_totals_send_time, 'HH24:MI'),
              $2
            ) AS send_time
       FROM fuel_stations fs
       LEFT JOIN station_settings ss ON ss.station_id = fs.id
      WHERE fs.id = $1::uuid
      LIMIT 1`,
    [stationId, DEFAULT_TANZANIA_DAILY_TOTALS_SEND_TIME],
  )

  if (!row) throw new Error(`Station ${stationId} not found`)

  return {
    timezone: row.timezone || 'Africa/Dar_es_Salaam',
    sendTime: normalizeTanzaniaDailyTotalsSendTime(
      row.send_time || DEFAULT_TANZANIA_DAILY_TOTALS_SEND_TIME,
    ),
  }
}

export async function setTanzaniaDailyTotalsSendTime(
  stationId: string,
  value: unknown,
): Promise<TanzaniaDailyTotalsScheduleConfig> {
  const sendTime = normalizeTanzaniaDailyTotalsSendTime(value)
  await query(
    `INSERT INTO station_settings (
       id, station_id, tanzania_daily_totals_send_time
     ) VALUES ($1::uuid, $2::uuid, $3::time)
     ON CONFLICT (station_id)
     DO UPDATE SET tanzania_daily_totals_send_time = EXCLUDED.tanzania_daily_totals_send_time,
                   updated_at = NOW()`,
    [uuidv4(), stationId, sendTime],
  )
  return await getTanzaniaDailyTotalsScheduleConfig(stationId)
}

export async function listTanzaniaDailyTotalSubmissions(
  stationId: string,
  limit = 120,
): Promise<TanzaniaDailyTotalSubmissionHistoryItem[]> {
  const safeLimit = Math.max(1, Math.min(365, Math.trunc(limit)))
  const rows = await queryAll<SubmissionHistoryRow>(
    `SELECT id::text,
            business_date::text,
            z_number,
            status,
            request_payload,
            response_payload,
            proxy_request_id,
            retry_count,
            next_retry_at,
            last_error,
            submitted_at,
            created_at,
            updated_at
       FROM tanzania_daily_total_submissions
      WHERE station_id = $1::uuid
      ORDER BY business_date DESC, created_at DESC
      LIMIT $2`,
    [stationId, safeLimit],
  )

  return rows.map((row) => ({
    id: row.id,
    businessDate: row.business_date,
    zNumber: row.z_number,
    status: row.status,
    requestPayload: row.request_payload,
    responsePayload: row.response_payload ?? null,
    proxyRequestId: row.proxy_request_id,
    retryCount: Number(row.retry_count || 0),
    nextRetryAt: isoOrNull(row.next_retry_at),
    lastError: row.last_error,
    submittedAt: isoOrNull(row.submitted_at),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }))
}
