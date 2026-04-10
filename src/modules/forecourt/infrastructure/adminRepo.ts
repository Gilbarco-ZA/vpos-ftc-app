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

export type ForecourtEventRow = {
  id: string
  station_id: string
  source: string
  apc: string | null
  event_type: string
  payload: any
  occurred_at: string
  received_at: string
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
            money_due, volume, occurred_at, raw
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
