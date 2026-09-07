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
              AND t.transaction_date_time <= a.created_at + INTERVAL '4 hours'
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

  // A station configured for pre-transaction capture must never fall through
  // the normal linking-window timeout and fiscalize an unmatched sale as an
  // anonymous customer. Holding the expiry at infinity keeps the transaction
  // OPEN until the matching nozzle allocation is attached above.
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

export async function claimEligibleTransactionFiscalizationQueueRepo(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const statement = buildClaimEligibleTransactionFiscalizationQueueSql(input)
  return await withTransaction(async (client) => {
    await attachPendingPreFuelCustomersTx(client, input.stationId)
    const result = await txQuery<any>(client, statement.sql, statement.params)
    return result.rows
  })
}

export async function claimEligibleProxyFiscalizationTransactionsRepo(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const statement = buildClaimEligibleProxyFiscalizationTransactionsSql(input)
  return await withTransaction(async (client) => {
    await attachPendingPreFuelCustomersTx(client, input.stationId)
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
