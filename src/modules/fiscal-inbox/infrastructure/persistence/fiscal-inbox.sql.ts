export function fiscalInboxListCountSql(whereSql: string) {
  return `SELECT COUNT(*)::bigint AS cnt FROM fiscal_inbox ${whereSql}`
}

export function fiscalInboxListRowsSql(
  whereSql: string,
  limitParamIndex: number,
  offsetParamIndex: number,
) {
  return `SELECT fi.id,
          fi.station_id,
          fi.topic,
          fi.status,
          fi.request_id,
          fi.attempt_count,
          fi.next_attempt_at,
          fi.received_at,
          fi.processed_at,
          fi.dead_at,
          fi.resolved_at,
          fi.error_text,
          fi.message_json,
          tx.id AS related_transaction_id,
          tx.status AS related_transaction_status
     FROM fiscal_inbox fi
     LEFT JOIN transactions tx
       ON tx.station_id::text = fi.station_id::text
      AND tx.deleted_at IS NULL
      AND tx.id::text = COALESCE(
        NULLIF(fi.message_json->>'transactionId', ''),
        NULLIF(fi.request_id, '')
      )
     ${whereSql}
    ORDER BY fi.received_at DESC, fi.id DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`
}

export const fiscalInboxSql = {
  getById: `SELECT fi.id,
          fi.station_id,
          fi.topic,
          fi.request_id,
          fi.status,
          fi.attempt_count,
          fi.next_attempt_at,
          fi.received_at,
          fi.processed_at,
          fi.dead_at,
          fi.resolved_at,
          fi.error_text,
          fi.message_json,
          tx.id AS related_transaction_id,
          tx.status AS related_transaction_status
     FROM fiscal_inbox fi
     LEFT JOIN transactions tx
       ON tx.station_id::text = fi.station_id::text
      AND tx.deleted_at IS NULL
      AND tx.id::text = COALESCE(
        NULLIF(fi.message_json->>'transactionId', ''),
        NULLIF(fi.request_id, '')
      )
    WHERE fi.id = $1
      AND fi.station_id::text = $2::text`,
  findByRequestId: `SELECT *
     FROM fiscal_inbox
    WHERE request_id::text = $1::text
      AND ($2::text IS NULL OR station_id::text = $2::text)
    ORDER BY received_at ASC, id ASC`,
  getNewestByRequestId: `SELECT id, received_at, status, topic, station_id, request_id
     FROM fiscal_inbox
    WHERE request_id::text = $1::text
      AND ($2::text IS NULL OR station_id::text = $2::text)
    ORDER BY received_at DESC, id DESC
    LIMIT 1`,
  getStatusSnapshot: `SELECT id, station_id, status, request_id
     FROM fiscal_inbox
    WHERE id = $1
      AND station_id::text = $2::text`,
  deleteById: `DELETE FROM fiscal_inbox
    WHERE id = $1
      AND station_id::text = $2::text
    RETURNING id`,
  requeueById: `UPDATE fiscal_inbox
      SET status = 'PENDING',
          attempt_count = 0,
          next_attempt_at = NOW(),
          dead_at = NULL,
          error_text = NULL,
          processed_at = NULL,
          resolved_at = NULL,
          updated_at = NOW()
    WHERE id = $1
      AND station_id::text = $2::text
    RETURNING id`,
  markDeadById: `UPDATE fiscal_inbox
      SET status = 'DEAD',
          dead_at = COALESCE(dead_at, NOW()),
          resolved_at = NULL,
          error_text = $3,
          updated_at = NOW()
    WHERE id = $1
      AND station_id::text = $2::text
    RETURNING id`,
  markFailedById: `UPDATE fiscal_inbox
      SET status = 'FAILED',
          resolved_at = NULL,
          error_text = $3,
          next_attempt_at = NOW(),
          updated_at = NOW()
    WHERE id = $1
      AND station_id::text = $2::text
    RETURNING id`,
  markProcessedById: `UPDATE fiscal_inbox
      SET status = 'PROCESSED',
          processed_at = COALESCE(processed_at, NOW()),
          resolved_at = COALESCE(resolved_at, NOW()),
          updated_at = NOW()
    WHERE id = $1
      AND station_id::text = $2::text
    RETURNING id`,
  cloneSourceById: `SELECT station_id, topic, request_id, message_json
     FROM fiscal_inbox
    WHERE id = $1
      AND station_id::text = $2::text`,
  cloneInsert: `INSERT INTO fiscal_inbox (
      station_id,
      topic,
      request_id,
      status,
      attempt_count,
      next_attempt_at,
      received_at,
      processed_at,
      dead_at,
      resolved_at,
      error_text,
      message_json
    ) VALUES (
      $1, $2, $3,
      'PENDING',
      0,
      NOW(),
      NOW(),
      NULL,
      NULL,
      NULL,
      NULL,
      $4
    )
    RETURNING id`,
  enqueue: `INSERT INTO fiscal_inbox (station_id, topic, request_id, message_json, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    ON CONFLICT (station_id, topic, request_id)
      WHERE request_id IS NOT NULL
      DO UPDATE SET message_json = EXCLUDED.message_json,
                    status = 'PENDING',
                    attempt_count = 0,
                    next_attempt_at = NOW(),
                    dead_at = NULL,
                    resolved_at = NULL,
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
  markDeliveryFailed: `UPDATE fiscal_inbox
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
          resolved_at = NULL,
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
