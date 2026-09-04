import type { ListTransactionsRepoOptions } from './transaction.types'

import { queryAll, queryPaginated } from '@/src/platform/db/postgres'

const receiptNumberJoinSql = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT NULLIF(BTRIM(r.receipt_number), '')
          FROM receipts r
         WHERE r.station_id = t.station_id
           AND r.transaction_id = t.id
         ORDER BY r.generated_at DESC
         LIMIT 1
      ),
      (
        SELECT COALESCE(
          NULLIF(BTRIM(fe.response_payload #>> '{details,receipt,receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{details,receipt,ReceiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{details,receipt,receipt_number}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{details,receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{details,ReceiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{receipt,receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{receipt,ReceiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{receipt,receipt_number}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{ReceiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{final,details,receipt,receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{final,details,receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{submission,details,receipt,receiptNumber}'), ''),
          NULLIF(BTRIM(fe.response_payload #>> '{submission,details,receiptNumber}'), '')
        )
          FROM fiscalization_events fe
         WHERE fe.station_id = t.station_id
           AND fe.transaction_id = t.id
         ORDER BY CASE WHEN fe.status = 'SUCCESS' THEN 0 ELSE 1 END,
                  fe.occurred_at DESC,
                  fe.created_at DESC
         LIMIT 1
      )
    ) AS receipt_number
  ) receipt_info ON TRUE
`

const fromSql = `
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  ${receiptNumberJoinSql}
`

const selectSql = `
  SELECT
    t.*,
    receipt_info.receipt_number,
    c.buyer_name,
    c.tin,
    c.buyer_name AS customer_buyer_name,
    c.tin AS customer_tin,
    c.buyer_type AS customer_buyer_type
  ${fromSql}
`

const countSql = `
  SELECT COUNT(*)::text AS count
  ${fromSql}
`

function buildFilter(
  stationId: string,
  opts: ListTransactionsRepoOptions = {},
) {
  const conditions = ['t.station_id = $1', 't.deleted_at IS NULL']
  const params: unknown[] = [stationId]
  const addParam = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const status = String(opts.status || '')
    .trim()
    .toUpperCase()
  const excludeStatus = String(opts.excludeStatus || '')
    .trim()
    .toUpperCase()
  const scope = String(opts.scope || '')
    .trim()
    .toLowerCase()
  const transactionId = String(opts.transactionId || '').trim()
  const search = String(opts.search || '').trim()
  const from = String(opts.from || '').trim()
  const to = String(opts.to || '').trim()
  const startDate = String(opts.startDate || '').trim()
  const endDate = String(opts.endDate || '').trim()

  if (status) {
    conditions.push(`UPPER(COALESCE(t.status, '')) = ${addParam(status)}`)
  } else if (scope === 'fiscalized') {
    conditions.push(
      `(t.fiscalized_at IS NOT NULL OR UPPER(COALESCE(t.status, '')) = 'FISCALIZED')`,
    )
  } else if (scope === 'non-fiscalized') {
    conditions.push(
      `(t.fiscalized_at IS NULL AND UPPER(COALESCE(t.status, '')) <> 'FISCALIZED')`,
    )
  }

  if (excludeStatus) {
    conditions.push(
      `UPPER(COALESCE(t.status, '')) <> ${addParam(excludeStatus)}`,
    )
  }

  if (transactionId) {
    conditions.push(`t.id::text ILIKE ${addParam(`%${transactionId}%`)}`)
  }

  if (opts.pumpNumber != null && Number.isFinite(Number(opts.pumpNumber))) {
    conditions.push(`t.pump_number = ${addParam(Number(opts.pumpNumber))}`)
  }

  if (search) {
    const token = addParam(`%${search}%`)
    conditions.push(`(
      t.id::text ILIKE ${token}
      OR COALESCE(receipt_info.receipt_number, '') ILIKE ${token}
      OR COALESCE(t.fiscalization_reference, '') ILIKE ${token}
      OR COALESCE(t.fuel_type, '') ILIKE ${token}
      OR COALESCE(c.buyer_name, '') ILIKE ${token}
      OR COALESCE(c.tin, '') ILIKE ${token}
      OR CAST(t.pump_number AS TEXT) ILIKE ${token}
    )`)
  }

  if (from) conditions.push(`t.transaction_date_time >= ${addParam(from)}`)
  if (to) conditions.push(`t.transaction_date_time <= ${addParam(to)}`)

  const stationTimezone = `COALESCE(
    (SELECT NULLIF(BTRIM(fs.timezone), '')
       FROM fuel_stations fs
      WHERE fs.id = $1
        AND fs.deleted_at IS NULL
      LIMIT 1),
    'UTC'
  )`

  if (startDate) {
    conditions.push(
      `t.transaction_date_time >= (${addParam(startDate)}::date::timestamp AT TIME ZONE ${stationTimezone})`,
    )
  }
  if (endDate) {
    conditions.push(
      `t.transaction_date_time < ((${addParam(endDate)}::date + 1)::timestamp AT TIME ZONE ${stationTimezone})`,
    )
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  const orderBy =
    status === 'FISCALIZED' || scope === 'fiscalized'
      ? 'ORDER BY t.fiscalized_at DESC NULLS LAST, t.transaction_date_time DESC'
      : 'ORDER BY t.transaction_date_time DESC'

  return { params, where, orderBy }
}

export async function listTransactionsWithReceiptNumbersRepo(
  stationId: string,
  opts: ListTransactionsRepoOptions = {},
) {
  const { params, where, orderBy } = buildFilter(stationId, opts)
  const baseQuery = `${selectSql}\n${where}\n${orderBy}`
  const baseCount = `${countSql}\n${where}`

  if (opts.page || opts.pageSize) {
    const page = Math.max(1, Number(opts.page || 1))
    const pageSize = Math.min(
      200,
      Math.max(1, Number(opts.pageSize || opts.limit || 50)),
    )
    const paginated = await queryPaginated<any>(
      baseQuery,
      baseCount,
      params,
      { page, pageSize },
    )
    return {
      items: paginated.data,
      total: paginated.total,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalPages: paginated.totalPages,
    }
  }

  const limit = Math.min(500, Math.max(1, Number(opts.limit || 200)))
  const rows = await queryAll<any>(`${baseQuery} LIMIT $${params.length + 1}`, [
    ...params,
    limit,
  ])
  return {
    items: rows,
    total: rows.length,
    page: 1,
    pageSize: limit,
    totalPages: 1,
  }
}
