export const fiscalInboxSql = {
  enqueue: `INSERT INTO fiscal_inbox (station_id, topic, request_id, message_json, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    ON CONFLICT (station_id, topic, request_id)
      WHERE request_id IS NOT NULL
      DO UPDATE SET message_json = EXCLUDED.message_json,
                    status = 'PENDING',
                    attempt_count = 0,
                    next_attempt_at = NOW(),
                    dead_at = NULL,
                    error_text = NULL,
                    received_at = NOW(),
                    updated_at = NOW()
    RETURNING id`,
  claimBatch: `WITH batch AS (
       SELECT id
         FROM fiscal_inbox
        WHERE status IN ('PENDING','FAILED')
          AND next_attempt_at <= NOW()
          AND status <> 'DEAD'
        ORDER BY received_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE fiscal_inbox fi
        SET status = 'PROCESSING',
            updated_at = NOW()
       FROM batch
      WHERE fi.id = batch.id
      RETURNING fi.id, fi.station_id, fi.topic, fi.request_id, fi.message_json, fi.attempt_count`,
  markProcessed: `UPDATE fiscal_inbox
      SET status = 'PROCESSED',
          processed_at = NOW(),
          updated_at = NOW()
    WHERE id = $1`,
  markFailed: `UPDATE fiscal_inbox
      SET attempt_count = attempt_count + 1,
          error_text = $2,
          status = CASE
                    WHEN attempt_count + 1 >= $3 THEN 'DEAD'
                    ELSE 'FAILED'
                  END,
          dead_at = CASE
                    WHEN attempt_count + 1 >= $3 THEN NOW()
                    ELSE dead_at
                  END,
          next_attempt_at = CASE
                    WHEN attempt_count + 1 >= $3 THEN next_attempt_at
                    ELSE NOW() + (LEAST(900, POWER(2, GREATEST(0, attempt_count))) * INTERVAL '1 second')
                  END,
          processed_at = NULL,
          updated_at = NOW()
    WHERE id = $1`,
  metricsByStation: `SELECT
      COUNT(*) FILTER (WHERE status IN ('PENDING','FAILED') AND next_attempt_at <= NOW()) AS ready,
      COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
      COUNT(*) FILTER (WHERE status = 'DEAD') AS dead,
      MIN(received_at) FILTER (WHERE status IN ('PENDING','FAILED') AND next_attempt_at <= NOW()) AS oldest_ready_at,
      MIN(received_at) FILTER (WHERE status = 'DEAD') AS oldest_dead_at
    FROM fiscal_inbox
   WHERE station_id = $1`,
} as const
