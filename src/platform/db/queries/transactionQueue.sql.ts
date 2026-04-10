export const transactionQueueSql = {
  claimNextBatch: `WITH claimed AS (
      SELECT id
        FROM transaction_queue
       WHERE status = 'PENDING'
         AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
    )
    UPDATE transaction_queue tq
       SET status = 'PROCESSING',
           processing_started_at = NOW(),
           updated_at = NOW()
      FROM claimed
     WHERE tq.id = claimed.id
    RETURNING tq.id, tq.station_id, tq.payload, tq.retry_count, tq.transaction_id`,
  claimPendingForStation: `WITH picked AS (
      SELECT id
      FROM transaction_queue
      WHERE station_id = $1
        AND status = 'PENDING'
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ORDER BY created_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    UPDATE transaction_queue q
       SET status = 'PROCESSING',
           processing_started_at = NOW(),
           updated_at = NOW()
      FROM picked
     WHERE q.id = picked.id
    RETURNING q.id, q.station_id, q.payload, q.retry_count, q.transaction_id`,
  markDone: `UPDATE transaction_queue
     SET status = 'DONE',
         last_error = NULL,
         next_attempt_at = NULL,
         updated_at = NOW()
   WHERE id = $1`,
  markFailedTerminal: `UPDATE transaction_queue
     SET status = 'FAILED',
         retry_count = $2,
         last_error = $3,
         next_attempt_at = NULL,
         updated_at = NOW()
   WHERE id = $1`,
  requeuePendingWithDelay: `UPDATE transaction_queue
     SET status = 'PENDING',
         retry_count = $2,
         last_error = $3,
         next_attempt_at = NOW() + ($4 || ' seconds')::interval,
         updated_at = NOW()
   WHERE id = $1`,
  markFailedWithOptionalDelay: `UPDATE transaction_queue
     SET status = 'FAILED',
         retry_count = $2,
         last_error = $3,
         next_attempt_at = CASE
           WHEN $4::int IS NULL THEN NULL
           ELSE NOW() + ($4::int * INTERVAL '1 second')
         END,
         updated_at = NOW()
   WHERE id = $1`,
  resetStuckProcessing: `UPDATE transaction_queue
     SET status = 'PENDING',
         processing_started_at = NULL,
         updated_at = NOW()
   WHERE station_id = $1
     AND status = 'PROCESSING'
     AND processing_started_at < NOW() - ($2::int * INTERVAL '1 millisecond')`,
  requeueReadyFailures: `UPDATE transaction_queue
     SET status = 'PENDING',
         updated_at = NOW()
   WHERE station_id = $1
     AND status = 'FAILED'
     AND next_attempt_at IS NOT NULL
     AND next_attempt_at <= NOW()`,
  updatePayload: `UPDATE transaction_queue
     SET payload = $2::jsonb,
         updated_at = NOW()
   WHERE id = $1`,
  selectExistingTransactionByQueueId: `SELECT *
     FROM transactions
    WHERE station_id = $1
      AND source_queue_id = $2
      AND deleted_at IS NULL`,
  selectExistingTransactionById: `SELECT *
     FROM transactions
    WHERE id = $1
      AND station_id = $2
      AND deleted_at IS NULL`,
  enqueueForTransaction: `INSERT INTO transaction_queue (id, station_id, status, payload, transaction_id)
    VALUES ($1, $2, 'PENDING', $3::jsonb, $4)
    ON CONFLICT (station_id, transaction_id) WHERE transaction_id IS NOT NULL DO UPDATE
    SET status = CASE
                   WHEN transaction_queue.status IN ('PROCESSING', 'FAILED')
                   THEN transaction_queue.status
                   ELSE 'PENDING'
                 END,
        payload = EXCLUDED.payload,
        last_error = NULL,
        next_attempt_at = NULL,
        updated_at = NOW()`,
} as const
