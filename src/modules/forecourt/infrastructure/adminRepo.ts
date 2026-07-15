import type { ForecourtEventRow } from '@/src/modules/forecourt/contracts/admin'

import { queryAll, queryOne } from '@/src/platform/db/postgres'

export type ForecourtEventCountRow = {
  event_type: string
  cnt: number
  last_occurred_at: string
}

export type ForecourtLastEventRow = {
  event_type: string
  occurred_at: string
  received_at: string
  source: string
}

export type ForecourtTxCountRow = {
  status: string
  cnt: number
}

export type ForecourtStateRow = {
  station_id: string
  fp_id: number
  status: string | null
  last_event_id: string | null
  last_event_type: string | null
  data: any
  updated_at: string
}

export type ForecourtTransactionRow = {
  id: string
  station_id: string
  fp_id: number | null
  is_supported: boolean
  trans_seq_no: string | null
  sm_id: string | null
  trans_lock_id: string | null
  trans_info_mask: string | null
  money_due: string | null
  volume: string | null
  occurred_at: string
  raw: any
  doms_external_payment_reference?: string | null
  doms_ept_id?: string | null
  doms_ept_sequence_no?: string | null
  doms_ept_receipt_format_id?: string | null
  doms_receipt_no?: string | null
  doms_card_label?: string | null
  doms_card_pan_masked?: string | null
  doms_unattended_receipt_json?: any
  doms_unattended_payment_json?: any
}

export type ForecourtPriceRow = {
  station_id: string
  price_set_id: number
  price_group_id: number
  grade_id: number
  price: string | null
  updated_at: string
}

export async function listForecourtEventCounts(stationId: string) {
  return await queryAll<ForecourtEventCountRow>(
    `
      SELECT event_type,
             COUNT(*)::int AS cnt,
             MAX(occurred_at)::text AS last_occurred_at
        FROM forecourt_events
       WHERE station_id = $1
         AND occurred_at > NOW() - INTERVAL '6 hours'
       GROUP BY event_type
       ORDER BY last_occurred_at DESC
       LIMIT 200
    `,
    [stationId],
  )
}

export async function getLastForecourtEventByType(
  stationId: string,
  patterns: string[],
) {
  const clauses = patterns.map((_, idx) => `event_type ILIKE $${idx + 2}`)
  return await queryOne<ForecourtLastEventRow>(
    `
      SELECT event_type, occurred_at::text AS occurred_at, received_at::text AS received_at, source
        FROM forecourt_events
       WHERE station_id = $1
         AND (${clauses.join(' OR ')})
       ORDER BY occurred_at DESC
       LIMIT 1
    `,
    [stationId, ...patterns],
  )
}

export async function getLastJplReceipt(stationId: string) {
  return await queryOne<{ received_at: string }>(
    `
      SELECT received_at::text AS received_at
        FROM forecourt_events
       WHERE station_id = $1
         AND source = 'jpl_tcp'
       ORDER BY received_at DESC
       LIMIT 1
    `,
    [stationId],
  )
}

export async function getTransactionsCreatedLastHour(stationId: string) {
  return await queryOne<{ cnt: number }>(
    `
      SELECT COUNT(*)::int AS cnt
        FROM transactions
       WHERE station_id = $1
         AND created_at > NOW() - INTERVAL '1 hour'
    `,
    [stationId],
  )
}

export async function listTransactionStatusCounts(stationId: string) {
  return await queryAll<ForecourtTxCountRow>(
    `
      SELECT status, COUNT(*)::int AS cnt
        FROM transactions
       WHERE station_id = $1
         AND deleted_at IS NULL
       GROUP BY status
       ORDER BY status ASC
    `,
    [stationId],
  )
}

export async function getNonFiscalizedTransactionCount(stationId: string) {
  return await queryOne<{ cnt: number }>(
    `
      SELECT COUNT(*)::int AS cnt
        FROM transactions
       WHERE station_id = $1
         AND deleted_at IS NULL
         AND status IN ('OPEN', 'ALLOCATED', 'FISCALIZING', 'FAILED')
    `,
    [stationId],
  )
}

export async function listForecourtEvents(params: {
  stationId: string
  limit: number
  since?: string | null
  until?: string | null
  source?: string | null
  eventType?: string | null
  pumpId?: string | null
  action?: string | null
}) {
  const where: string[] = ['station_id = $1']
  const values: any[] = [params.stationId]
  let p = 2

  if (params.since) {
    where.push(`occurred_at >= $${p++}`)
    values.push(params.since)
  }
  if (params.until) {
    where.push(`occurred_at <= $${p++}`)
    values.push(params.until)
  }
  if (params.source) {
    where.push(`source = $${p++}`)
    values.push(params.source)
  }
  if (params.eventType) {
    const types = String(params.eventType)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (types.length === 1) {
      where.push(`event_type = $${p++}`)
      values.push(types[0])
    } else if (types.length > 1) {
      where.push(`event_type = ANY($${p++})`)
      values.push(types)
    }
  }
  if (params.pumpId) {
    where.push(`(payload->>'pumpId') = $${p++}`)
    values.push(String(params.pumpId))
  }
  if (params.action) {
    where.push(`(payload->>'action') = $${p++}`)
    values.push(String(params.action))
  }

  values.push(params.limit)

  return await queryAll<ForecourtEventRow>(
    `SELECT id, station_id, source, apc, event_type, payload, occurred_at, received_at
       FROM forecourt_events
      WHERE ${where.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${p}`,
    values,
  )
}

export async function listRecentForecourtEventsByPatterns(params: {
  stationId: string
  patterns: string[]
  limit: number
  source?: string | null
}) {
  const patterns = params.patterns
    .map((pattern) => String(pattern).trim())
    .filter(Boolean)
  if (!patterns.length) return []

  const where: string[] = ['station_id = $1']
  const values: any[] = [params.stationId]
  let i = 2

  if (params.source) {
    where.push(`source = $${i++}`)
    values.push(params.source)
  }

  const patternClauses = patterns.map(() => `event_type ILIKE $${i++}`)
  values.push(...patterns)
  where.push(`(${patternClauses.join(' OR ')})`)

  values.push(Math.max(1, Math.min(100, Math.trunc(params.limit))))

  return await queryAll<ForecourtEventRow>(
    `SELECT id, station_id, source, apc, event_type, payload, occurred_at, received_at
       FROM forecourt_events
      WHERE ${where.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${i}`,
    values,
  )
}

export async function listForecourtState(stationId: string) {
  return await queryAll<ForecourtStateRow>(
    `SELECT station_id, fp_id, status, last_event_id, last_event_type, data, updated_at
       FROM forecourt_state
      WHERE station_id = $1
      ORDER BY fp_id ASC`,
    [stationId],
  )
}

export async function listForecourtTransactions(params: {
  stationId: string
  limit: number
  fpId?: number | null
  since?: string | null
}) {
  const clauses: string[] = ['station_id = $1']
  const values: any[] = [params.stationId]
  let i = 2

  if (params.since) {
    clauses.push(`occurred_at >= $${i++}`)
    values.push(params.since)
  }
  if (params.fpId != null) {
    clauses.push(`fp_id = $${i++}`)
    values.push(params.fpId)
  }
  values.push(params.limit)

  return await queryAll<ForecourtTransactionRow>(
    `SELECT id, station_id, fp_id, is_supported, trans_seq_no, sm_id, trans_lock_id, trans_info_mask,
            money_due, volume, occurred_at, raw,
            doms_external_payment_reference, doms_ept_id, doms_ept_sequence_no,
            doms_ept_receipt_format_id, doms_receipt_no, doms_card_label,
            doms_card_pan_masked, doms_unattended_receipt_json, doms_unattended_payment_json
       FROM forecourt_transactions
      WHERE ${clauses.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${i}`,
    values,
  )
}

export async function listForecourtPrices(params: {
  stationId: string
  priceSetId?: number | null
}) {
  const clauses: string[] = ['station_id = $1']
  const values: any[] = [params.stationId]
  let i = 2

  if (params.priceSetId != null) {
    clauses.push(`price_set_id = $${i++}`)
    values.push(params.priceSetId)
  }

  return await queryAll<ForecourtPriceRow>(
    `SELECT station_id, price_set_id, price_group_id, grade_id, price, updated_at
       FROM forecourt_prices
      WHERE ${clauses.join(' AND ')}
      ORDER BY price_set_id DESC, price_group_id ASC, grade_id ASC`,
    values,
  )
}

export type ForecourtCommandHistoryRow = {
  id: string
  station_id: string
  command: string
  status: string
  requested_by: string | null
  requested_at: string
  updated_at: string
  payload: any
  result_status: string | null
  result_json: any
  result_received_at: string | null
  correlation_id: string | null
}

export type ForecourtTankDeliveryCheckpointRow = {
  id: string
  station_id: string
  tank_id: string | null
  tg_id: string
  delivery_report_seq_no: string
  tank_delivery_seq_no: string
  pos_id: string | null
  clear_status: string
  source: string
  last_event_type: string | null
  first_seen_at: string
  last_event_at: string
  payload: any
  data: any
}

export type ForecourtWetstockEventRow = {
  id: string
  station_id: string
  tank_id: string | null
  tg_id: string | null
  delivery_report_seq_no: string | null
  tank_delivery_seq_no: string | null
  event_type: string
  source: string
  payload: any
  data: any
  created_at: string
}

export type ForecourtPendingPriceSetRow = {
  station_id: string
  price_set_id: number
  activation_at: string
  source: string
  is_confirmed_on_doms: boolean
  status: string
  last_event_type: string | null
  last_event_at: string | null
  data: any
  created_at: string
  updated_at: string
}

export type ForecourtPriceScheduleEventRow = {
  id: string
  station_id: string
  price_set_id: number
  activation_at: string
  event_type: string
  source: string
  submitted_by: string | null
  doms_confirmation_status: string | null
  data: any
  created_at: string
}

export async function listForecourtCommandHistory(params: {
  stationId: string
  limit: number
  command?: string | null
  status?: string | null
  correlationId?: string | null
}) {
  const where: string[] = ['pc.station_id = $1']
  const values: any[] = [params.stationId]
  let i = 2

  if (params.command) {
    where.push(`pc.command ILIKE $${i++}`)
    values.push(`%${params.command}%`)
  }
  if (params.status) {
    where.push(`pc.status = $${i++}`)
    values.push(params.status)
  }
  if (params.correlationId) {
    where.push(
      `(pc.payload::text ILIKE $${i} OR COALESCE(pcr.result_json, '{}'::jsonb)::text ILIKE $${i})`,
    )
    values.push(`%${params.correlationId}%`)
    i += 1
  }

  values.push(Math.max(1, Math.min(200, Math.trunc(params.limit))))

  return await queryAll<ForecourtCommandHistoryRow>(
    `SELECT pc.id,
            pc.station_id,
            pc.command,
            pc.status,
            pc.requested_by,
            pc.requested_at::text AS requested_at,
            pc.updated_at::text AS updated_at,
            pc.payload,
            pcr.status AS result_status,
            pcr.result_json,
            pcr.received_at::text AS result_received_at,
            COALESCE(
              pc.payload->>'correlationId',
              pc.payload#>>'{request,correlationId}',
              pc.payload#>>'{payload,correlationId}',
              pcr.result_json->>'correlationId',
              pcr.result_json#>>'{data,correlationId}',
              pcr.result_json#>>'{result,correlationId}',
              pcr.result_json#>>'{result,response,correlationId}',
              pcr.result_json#>>'{data,response,correlationId}'
            ) AS correlation_id
       FROM pos_commands pc
       LEFT JOIN LATERAL (
         SELECT status, result_json, received_at, updated_at
           FROM pos_command_results
          WHERE command_id = pc.id
          ORDER BY COALESCE(received_at, updated_at) DESC
          LIMIT 1
       ) pcr ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY pc.requested_at DESC
      LIMIT $${i}`,
    values,
  )
}

export async function listForecourtTankDeliveryCheckpoints(params: {
  stationId: string
  limit: number
  clearStatus?: string | null
}) {
  const where: string[] = ['station_id = $1']
  const values: any[] = [params.stationId]
  let i = 2

  if (params.clearStatus) {
    where.push(`clear_status = $${i++}`)
    values.push(params.clearStatus)
  }

  values.push(Math.max(1, Math.min(200, Math.trunc(params.limit))))

  return await queryAll<ForecourtTankDeliveryCheckpointRow>(
    `SELECT id,
            station_id,
            tank_id,
            tg_id,
            delivery_report_seq_no,
            tank_delivery_seq_no,
            pos_id,
            clear_status,
            source,
            last_event_type,
            first_seen_at::text AS first_seen_at,
            last_event_at::text AS last_event_at,
            payload,
            data
       FROM forecourt_tank_delivery_checkpoints
      WHERE ${where.join(' AND ')}
      ORDER BY last_event_at DESC
      LIMIT $${i}`,
    values,
  )
}

export async function listForecourtWetstockEvents(params: {
  stationId: string
  limit: number
}) {
  return await queryAll<ForecourtWetstockEventRow>(
    `SELECT id,
            station_id,
            tank_id,
            tg_id,
            delivery_report_seq_no,
            tank_delivery_seq_no,
            event_type,
            source,
            payload,
            data,
            created_at::text AS created_at
       FROM forecourt_wetstock_events
      WHERE station_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [params.stationId, Math.max(1, Math.min(100, Math.trunc(params.limit)))],
  )
}

export async function listForecourtPendingPriceSetsForAdmin(params: {
  stationId: string
  limit: number
}) {
  return await queryAll<ForecourtPendingPriceSetRow>(
    `SELECT station_id,
            price_set_id,
            activation_at::text AS activation_at,
            source,
            is_confirmed_on_doms,
            status,
            last_event_type,
            last_event_at::text AS last_event_at,
            data,
            created_at::text AS created_at,
            updated_at::text AS updated_at
       FROM forecourt_pending_price_sets
      WHERE station_id = $1
      ORDER BY activation_at ASC, updated_at DESC
      LIMIT $2`,
    [params.stationId, Math.max(1, Math.min(100, Math.trunc(params.limit)))],
  )
}

export async function listForecourtPriceScheduleEventsForAdmin(params: {
  stationId: string
  limit: number
}) {
  return await queryAll<ForecourtPriceScheduleEventRow>(
    `SELECT id,
            station_id,
            price_set_id,
            activation_at::text AS activation_at,
            event_type,
            source,
            submitted_by,
            doms_confirmation_status,
            data,
            created_at::text AS created_at
       FROM forecourt_price_schedule_events
      WHERE station_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [params.stationId, Math.max(1, Math.min(100, Math.trunc(params.limit)))],
  )
}
