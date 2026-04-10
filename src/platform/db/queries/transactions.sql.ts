export const transactionsSql = {
  claimEligibleWithoutTimer: `WITH candidates AS (
      SELECT id
        FROM transactions
       WHERE station_id = $1
         AND deleted_at IS NULL
         AND status IN ('OPEN', 'ALLOCATED', 'PENDING')
         AND (
           fiscal_queue_enqueued_at IS NULL
           OR EXISTS (
             SELECT 1
               FROM transaction_queue q
              WHERE q.station_id = transactions.station_id
                AND q.transaction_id = transactions.id
                AND q.status = 'DONE'
           )
           OR NOT EXISTS (
             SELECT 1
               FROM transaction_queue q
              WHERE q.station_id = transactions.station_id
                AND q.transaction_id = transactions.id
           )
         )
         AND (
           customer_id IS NOT NULL
           OR status = 'PENDING'
         )
       ORDER BY transaction_date_time ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $2
    )
    UPDATE transactions t
       SET fiscal_queue_enqueued_at = NOW(),
           status = CASE
                      WHEN t.status = 'OPEN' AND t.customer_id IS NOT NULL
                      THEN 'ALLOCATED'
                      ELSE t.status
                    END,
           updated_at = NOW()
      FROM candidates c
     WHERE t.id = c.id
    RETURNING t.id`,
  claimEligibleWithTimer: `WITH candidates AS (
      SELECT id
        FROM transactions
       WHERE station_id = $1
         AND deleted_at IS NULL
         AND status IN ('OPEN', 'ALLOCATED', 'PENDING')
         AND (
           fiscal_queue_enqueued_at IS NULL
           OR EXISTS (
             SELECT 1
               FROM transaction_queue q
              WHERE q.station_id = transactions.station_id
                AND q.transaction_id = transactions.id
                AND q.status = 'DONE'
           )
           OR NOT EXISTS (
             SELECT 1
               FROM transaction_queue q
              WHERE q.station_id = transactions.station_id
                AND q.transaction_id = transactions.id
           )
         )
         AND (
           customer_id IS NOT NULL
           OR status = 'PENDING'
           OR NOW() >= COALESCE(
                linking_window_expires_at,
                created_at + ($3::int * INTERVAL '1 second')
              )
         )
       ORDER BY transaction_date_time ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $2
    )
    UPDATE transactions t
       SET fiscal_queue_enqueued_at = NOW(),
           status = CASE
                      WHEN t.status = 'OPEN'
                       AND t.customer_id IS NULL
                       AND NOW() >= COALESCE(
                             t.linking_window_expires_at,
                             t.created_at + ($3::int * INTERVAL '1 second')
                           )
                      THEN 'PENDING'
                      WHEN t.status = 'OPEN'
                       AND t.customer_id IS NOT NULL
                      THEN 'ALLOCATED'
                      ELSE t.status
                    END,
           linking_window_expires_at = COALESCE(
             t.linking_window_expires_at,
             t.created_at + ($3::int * INTERVAL '1 second')
           ),
           updated_at = NOW()
      FROM candidates c
     WHERE t.id = c.id
    RETURNING t.id`,
} as const
