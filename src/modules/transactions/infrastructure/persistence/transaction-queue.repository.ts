import { queryOne, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  buildClaimEligibleProxyFiscalizationTransactionsSql,
  buildClaimEligibleTransactionFiscalizationQueueSql,
  upsertTransactionQueueSql,
} from './transaction.sql'

async function attachPendingPreFuelCustomersTx(
  client: any,
  stationId: string,
) {
  await txQuery(
    client,
    `UPDATE pre_fuel_customer_allocations a
        SET status = 'CANCELLED',
            cancelled_at = NOW(),
            updated_at = NOW()
       FROM station_settings ss
      WHERE ss.station_id = a.station_id
        AND a.station_id = $1::uuid
        AND a.status = 'PENDING'
        AND ss.tin_capture_order = 'before_transaction'
        AND COALESCE(ss.linking_window_seconds, 0) > 0
        AND a.created_at + (ss.linking_window_seconds * INTERVAL '1 second') <= NOW()`,
    [stationId],
  )

  const matches = await txQuery<{
    transaction_id: string
    allocation_id: string
  }>(
    client,
    `WITH candidates AS (
       SELECT a.id AS allocation_id,
              a.customer_id,
              a.allocated_by,
              matched.id AS transaction_id
         FROM pre_fuel_customer_allocations a
         JOIN station_settings ss
           ON ss.station_id = a.station_id
          AND ss.tin_capture_order = 'before_transaction'
         JOIN LATERAL (
           SELECT t.id
             FROM transactions t
            WHERE t.station_id = a.station_id
              AND t.deleted_at IS NULL
              AND t.customer_id IS NULL
              AND t.pump_number = a.pump_number
              AND t.nozzle_number = a.nozzle_number
              AND t.status IN ('OPEN', 'PENDING', 'ALLOCATED', 'FAILED')
              AND t.transaction_date_time >= a.created_at - INTERVAL '2 minutes'
              AND (
                COALESCE(ss.linking_window_seconds, 0) <= 0
                OR t.transaction_date_time < a.created_at + (ss.linking_window_seconds * INTERVAL '1 second')
              )
            ORDER BY t.transaction_date_time ASC, t.created_at ASC
            LIMIT 1
         ) matched ON TRUE
        WHERE a.station_id = $1::uuid
          AND a.status = 'PENDING'
        ORDER BY a.created_at ASC
        FOR UPDATE OF a
     ), updated AS (
       UPDATE transactions t
          SET customer_id = candidates.customer_id,
              allocated_by = COALESCE(candidates.allocated_by, t.allocated_by),
              status = CASE WHEN t.status IN ('OPEN', 'PENDING') THEN 'ALLOCATED' ELSE t.status END,
              updated_at = NOW()
         FROM candidates
        WHERE t.id = candidates.transaction_id
          AND t.station_id = $1::uuid
          AND t.customer_id IS NULL
       RETURNING t.id AS transaction_id,
                 candidates.allocation_id
     )
     SELECT transaction_id, allocation_id FROM updated`,
    [stationId],
  )

  for (const match of matches.rows) {
    await txQuery(
      client,
      `UPDATE pre_fuel_customer_allocations
          SET status = 'CONSUMED',
              transaction_id = $2::uuid,
              consumed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'PENDING'`,
      [match.allocation_id, match.transaction_id],
    )
  }

  await txQuery(
    client,
    `UPDATE transactions t
        SET linking_window_expires_at = 'infinity'::timestamptz,
            status = CASE WHEN t.status = 'PENDING' THEN 'OPEN' ELSE t.status END,
            updated_at = NOW()
       FROM station_settings ss
      WHERE ss.station_id = t.station_id
        AND ss.tin_capture_order = 'before_transaction'
        AND t.station_id = $1::uuid
        AND t.deleted_at IS NULL
        AND t.customer_id IS NULL
        AND t.status IN ('OPEN', 'PENDING', 'ALLOCATED')`,
    [stationId],
  )
}

async function requiresCompletedPrePrintTx(client: any, stationId: string) {
  const result = await txQuery<{
    auto_print_receipts: boolean
    print_receipt_order: string | null
  }>(
    client,
    `SELECT auto_print_receipts, print_receipt_order
       FROM station_settings
      WHERE station_id = $1::uuid
      LIMIT 1`,
    [stationId],
  )
  const row = result.rows[0]
  return Boolean(
    row?.auto_print_receipts === true &&
      row?.print_receipt_order === 'before_fiscalization',
  )
}

const completedOfflinePrintGate = (transactionAlias: string) => `EXISTS (
  SELECT 1
    FROM print_jobs preprint
   WHERE preprint.station_id = ${transactionAlias}.station_id
     AND preprint.source_transaction_id = ${transactionAlias}.id
     AND preprint.status = 'DONE'
     AND COALESCE(preprint.payload->>'offlinePrint', 'false') = 'true'
)`

function buildBeforePrintLocalClaim(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const limit = Math.max(1, Number(input.limit ?? 10))
  const hasTimer =
    typeof input.linkingWindowSeconds === 'number' &&
    input.linkingWindowSeconds > 0
  const eligibility = hasTimer
    ? `(
         customer_id IS NOT NULL
         OR status = 'PENDING'
         OR NOW() >= COALESCE(
              linking_window_expires_at,
              created_at + ($3::int * INTERVAL '1 second')
            )
       )`
    : `(
         customer_id IS NOT NULL
         OR status = 'PENDING'
       )`

  return {
    sql: `WITH candidates AS (
      SELECT id
        FROM transactions
       WHERE station_id = $1
         AND deleted_at IS NULL
         AND status IN ('OPEN', 'ALLOCATED', 'PENDING')
         AND (
           fiscal_queue_enqueued_at IS NULL
           OR EXISTS (
             SELECT 1 FROM transaction_queue q
              WHERE q.station_id = transactions.station_id
                AND q.transaction_id = transactions.id
                AND q.status = 'DONE'
           )
           OR NOT EXISTS (
             SELECT 1 FROM transaction_queue q
              WHERE q.station_id = transactions.station_id
                AND q.transaction_id = transactions.id
           )
         )
         AND ${eligibility}
         AND ${completedOfflinePrintGate('transactions')}
       ORDER BY transaction_date_time ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
    )
    UPDATE transactions t
       SET fiscal_queue_enqueued_at = NOW(),
           status = CASE
                      WHEN t.status = 'OPEN' AND t.customer_id IS NOT NULL
                      THEN 'ALLOCATED'
                      ${hasTimer ? `WHEN t.status = 'OPEN' AND t.customer_id IS NULL THEN 'PENDING'` : ''}
                      ELSE t.status
                    END,
           ${hasTimer ? `linking_window_expires_at = COALESCE(t.linking_window_expires_at, t.created_at + ($3::int * INTERVAL '1 second')),` : ''}
           updated_at = NOW()
      FROM candidates c
     WHERE t.id = c.id
    RETURNING t.id`,
    params: hasTimer
      ? [input.stationId, limit, input.linkingWindowSeconds]
      : [input.stationId, limit],
  }
}

function buildBeforePrintProxyClaim(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 10)))
  return {
    sql: `WITH eligible AS (
      SELECT t.id
        FROM transactions t
        JOIN station_settings ss ON ss.station_id = t.station_id
       WHERE t.station_id = $1
         AND ss.fiscalization_transport = 'proxy'
         AND t.deleted_at IS NULL
         AND t.cloud_transaction_id IS NULL
         AND t.fiscalization_reference IS NULL
         AND t.status IN ('OPEN','ALLOCATED','PENDING')
         AND (
           t.customer_id IS NOT NULL
           OR NOW() >= COALESCE(
                t.linking_window_expires_at,
                t.created_at + (COALESCE($2::int, 0) * INTERVAL '1 second')
              )
         )
         AND ${completedOfflinePrintGate('t')}
       ORDER BY t.transaction_date_time ASC
       LIMIT $3
       FOR UPDATE OF t SKIP LOCKED
    )
    UPDATE transactions t
       SET status = 'FISCALIZING',
           updated_at = NOW()
      FROM eligible e
     WHERE t.id = e.id
    RETURNING t.*`,
    params: [input.stationId, input.linkingWindowSeconds, limit],
  }
}

export async function claimEligibleTransactionFiscalizationQueueRepo(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  return await withTransaction(async (client) => {
    await attachPendingPreFuelCustomersTx(client, input.stationId)
    const statement = (await requiresCompletedPrePrintTx(client, input.stationId))
      ? buildBeforePrintLocalClaim(input)
      : buildClaimEligibleTransactionFiscalizationQueueSql(input)
    const result = await txQuery<any>(client, statement.sql, statement.params)
    return result.rows
  })
}

export async function claimEligibleProxyFiscalizationTransactionsRepo(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  return await withTransaction(async (client) => {
    await attachPendingPreFuelCustomersTx(client, input.stationId)
    const statement = (await requiresCompletedPrePrintTx(client, input.stationId))
      ? buildBeforePrintProxyClaim(input)
      : buildClaimEligibleProxyFiscalizationTransactionsSql(input)
    const result = await txQuery<any>(client, statement.sql, statement.params)
    return result.rows
  })
}

export async function enqueueTransactionQueueRepo(
  stationId: string,
  transactionId: string,
  payload: any = {},
) {
  return await queryOne<any>(upsertTransactionQueueSql, [
    uuidv4(),
    stationId,
    JSON.stringify({ transactionId, ...payload }),
    transactionId,
  ])
}
