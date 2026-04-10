export type ListTransactionsFilterOptions = {
  limit?: number
  page?: number
  pageSize?: number
  status?: string | null
  excludeStatus?: string | null
  scope?: 'all' | 'non-fiscalized' | 'fiscalized' | null
  transactionId?: string | null
  pumpNumber?: number | null
  search?: string | null
  from?: string | null
  to?: string | null
}

export const getTransactionStatusSnapshotSql = `SELECT id,
        station_id AS "stationId",
        customer_id AS "customerId",
        status,
        deleted_at AS "deletedAt"
   FROM transactions
  WHERE station_id = $1 AND id = $2
  LIMIT 1`

export function buildClaimEligibleTransactionFiscalizationQueueSql(input: {
  stationId: string
  limit?: number
  linkingWindowSeconds: number | null
}) {
  const limit = Math.max(1, Number(input.limit ?? 10))
  const hasTimer =
    typeof input.linkingWindowSeconds === 'number' &&
    input.linkingWindowSeconds > 0

  if (!hasTimer) {
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
      params: [input.stationId, limit],
    }
  }

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
    params: [input.stationId, limit, input.linkingWindowSeconds],
  }
}

export function buildPersistTransactionStatusUpdate(input: {
  stationId: string
  transactionId: string
  nextStatus: string
  expectedCurrentStatus?: string | null
  customerId?: string | null
  allocatedBy?: string | null
  touchAllocatedAt?: boolean
  fiscalizationReference?: string | null
  fiscalizationResponse?: unknown
  fiscalDocumentId?: string | null
  touchFiscalizedAt?: boolean
  lastError?: string | null
  clearLastError?: boolean
  incrementRetryCount?: boolean
}) {
  const sets = ['status = $3', 'updated_at = NOW()']
  const params: unknown[] = [
    input.stationId,
    input.transactionId,
    input.nextStatus,
  ]

  const addParam = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  if (input.customerId !== undefined) {
    sets.push(`customer_id = ${addParam(input.customerId)}`)
  }

  if (input.touchAllocatedAt) {
    sets.push('allocated_at = NOW()')
  }

  if (input.allocatedBy !== undefined) {
    sets.push(
      `allocated_by = COALESCE(${addParam(input.allocatedBy)}, allocated_by)`,
    )
  }

  if (input.fiscalizationReference !== undefined) {
    sets.push(
      `fiscalization_reference = COALESCE(${addParam(input.fiscalizationReference)}, fiscalization_reference)`,
    )
  }

  if (input.fiscalizationResponse !== undefined) {
    sets.push(
      `fiscalization_response = ${addParam(input.fiscalizationResponse)}`,
    )
  }

  if (input.fiscalDocumentId !== undefined) {
    sets.push(
      `fiscal_document_id = COALESCE(NULLIF(BTRIM(CAST(${addParam(input.fiscalDocumentId)} AS text)), ''), fiscal_document_id)`,
    )
  }

  if (input.touchFiscalizedAt) {
    sets.push('fiscalized_at = NOW()')
  }

  if (input.clearLastError) {
    sets.push('last_error = NULL')
  } else if (input.lastError !== undefined) {
    sets.push(`last_error = ${addParam(input.lastError)}`)
  }

  if (input.incrementRetryCount) {
    sets.push('retry_count = retry_count + 1')
  }

  const where = ['station_id = $1', 'id = $2', 'deleted_at IS NULL']

  if (input.expectedCurrentStatus) {
    where.push(`status = ${addParam(input.expectedCurrentStatus)}`)
  }

  return {
    sql: `UPDATE transactions
      SET ${sets.join(', ')}
    WHERE ${where.join(' AND ')}
    RETURNING *`,
    params,
  }
}

export function buildTransactionsFilter(
  stationId: string,
  opts: ListTransactionsFilterOptions = {},
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
    const token = addParam(`%${transactionId}%`)
    conditions.push(`t.id::text ILIKE ${token}`)
  }

  if (opts.pumpNumber != null && Number.isFinite(Number(opts.pumpNumber))) {
    conditions.push(`t.pump_number = ${addParam(Number(opts.pumpNumber))}`)
  }

  if (search) {
    const token = addParam(`%${search}%`)
    conditions.push(`(
      t.id::text ILIKE ${token}
      OR COALESCE(t.pos_reference, '') ILIKE ${token}
      OR COALESCE(t.fiscalization_reference, '') ILIKE ${token}
      OR COALESCE(t.fuel_type, '') ILIKE ${token}
      OR COALESCE(c.buyer_name, '') ILIKE ${token}
      OR COALESCE(c.tin, '') ILIKE ${token}
      OR CAST(t.pump_number AS TEXT) ILIKE ${token}
    )`)
  }

  if (from) {
    conditions.push(`t.transaction_date_time >= ${addParam(from)}`)
  }

  if (to) {
    conditions.push(`t.transaction_date_time <= ${addParam(to)}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const orderBy =
    status === 'FISCALIZED' || scope === 'fiscalized'
      ? 'ORDER BY t.fiscalized_at DESC NULLS LAST, t.transaction_date_time DESC'
      : 'ORDER BY t.transaction_date_time DESC'

  return { params, where, orderBy }
}

export const listTransactionsSelectSql = `
  SELECT
    t.*,
    c.buyer_name,
    c.tin,
    c.buyer_name AS customer_buyer_name,
    c.tin AS customer_tin,
    c.buyer_type AS customer_buyer_type
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
`

export const listTransactionsCountSql = `
  SELECT COUNT(*)::text AS count
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
`

export const getTransactionDetailsSql = `SELECT t.*, c.buyer_name, c.tin, c.buyer_type
   FROM transactions t
   LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.station_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`

export const getTransactionLinesSql = `SELECT
    tl.*,
    p.product_id AS product_external_id,
    p.product_code,
    p.product_name,
    p.currency,
    COALESCE(p.ext_product_id, p.product_id) AS mapped_product_id,
    COALESCE(p.ext_product_code, p.product_code) AS mapped_product_code,
    COALESCE(p.ext_product_class_code, p.product_class_code) AS mapped_product_class_code,
    COALESCE(p.ext_product_type_code, p.product_type_code) AS mapped_product_type_code,
    COALESCE(p.ext_description, p.product_name) AS mapped_description,
    p.product_name AS source_product_name,
    p.category,
    COALESCE(p.ext_unit_of_measure, p.unit_of_measure) AS mapped_unit_of_measure,
    COALESCE(p.ext_unit_of_packaging, p.unit_of_packaging) AS mapped_unit_of_packaging,
    COALESCE(p.ext_tax_code, p.tax_code) AS mapped_tax_code,
    p.tax_rate AS mapped_tax_rate,
    p.commodity_code AS mapped_commodity_code,
    COALESCE(p.ext_hazardous_indicator, p.hazardous_indicator) AS mapped_hazardous_indicator,
    (tl.quantity * tl.unit_price) AS line_total
  FROM transaction_lines tl
  LEFT JOIN products p
    ON p.id = tl.product_id
   AND p.station_id = $1
 WHERE tl.transaction_id = $2
 ORDER BY tl.created_at ASC`

export const getTransactionQueueSql = `SELECT id,
        station_id,
        transaction_id,
        status,
        retry_count,
        next_attempt_at,
        processing_started_at,
        last_error,
        created_at,
        updated_at,
        payload
   FROM transaction_queue
  WHERE station_id = $1
    AND transaction_id = $2
  ORDER BY updated_at DESC, created_at DESC, id DESC
  LIMIT 1`

export const listPendingTransactionsSql = `SELECT * FROM transactions
  WHERE station_id = $1
    AND deleted_at IS NULL
    AND status IN ('OPEN','ALLOCATED','PENDING','FAILED')
  ORDER BY transaction_date_time DESC
  LIMIT 200`

export function buildClaimEligibleProxyFiscalizationTransactionsSql(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 10)))

  return {
    sql: `
      WITH eligible AS (
        SELECT id
        FROM transactions
        WHERE station_id = $1
          AND deleted_at IS NULL
          AND cloud_transaction_id IS NULL
          AND fiscalization_reference IS NULL
          AND status IN ('OPEN','ALLOCATED','PENDING')
          AND (
            customer_id IS NOT NULL
            OR NOW() >= COALESCE(
                 linking_window_expires_at,
                 created_at + (COALESCE($2::int, 0) * INTERVAL '1 second')
               )
          )
        ORDER BY transaction_date_time ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $3
      )
      UPDATE transactions t
      SET status = 'FISCALIZING',
          updated_at = NOW()
      FROM eligible e
      WHERE t.id = e.id
      RETURNING t.*
    `,
    params: [input.stationId, input.linkingWindowSeconds, limit],
  }
}

export const listTransactionCatalogProductsSql = `SELECT
    p.id,
    p.product_id AS "externalProductId",
    p.product_code AS "productCode",
    p.product_name AS "productName",
    COALESCE(p.ext_unit_price, p.unit_price, 0) AS "unitPrice",
    COALESCE(p.ext_currency, p.currency) AS currency,
    COALESCE(p.ext_unit_of_measure, p.unit_of_measure) AS "unitOfMeasure",
    p.category_id AS "categoryId",
    COALESCE(pc.name, p.category) AS "categoryName",
    pc.icon AS "categoryIcon",
    pc.image_path AS "categoryImagePath"
  FROM products p
  LEFT JOIN product_categories pc
    ON pc.id = p.category_id
   AND pc.station_id = p.station_id
  WHERE p.station_id = $1
  ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.product_name ASC, p.product_code ASC`

export const getTransactionEditableLinesSql = `SELECT
    tl.id,
    tl.product_id AS "productId",
    tl.quantity,
    tl.unit_price AS "unitPrice",
    (tl.quantity * tl.unit_price) AS "lineTotal",
    p.product_code AS "productCode",
    p.product_name AS "productName",
    COALESCE(p.ext_currency, p.currency) AS currency
  FROM transaction_lines tl
  LEFT JOIN products p
    ON p.id = tl.product_id
   AND p.station_id = $1
  JOIN transactions t
    ON t.id = tl.transaction_id
   AND t.station_id = $1
  WHERE tl.transaction_id = $2
  ORDER BY tl.created_at ASC`

export const loadValidatedProductsSql = `SELECT
    p.id,
    p.product_code,
    p.product_name,
    COALESCE(p.ext_unit_price, p.unit_price, 0) AS unit_price,
    COALESCE(p.ext_currency, p.currency) AS currency,
    p.category,
    COALESCE(pc.name, p.category) AS category_name
  FROM products p
  LEFT JOIN product_categories pc
    ON pc.id = p.category_id
   AND pc.station_id = p.station_id
  WHERE p.station_id = $1
    AND p.id = ANY($2::uuid[])`

export const recalcTransactionTotalsSql = `SELECT
    COALESCE(SUM(quantity * unit_price), 0) AS total_amount,
    COUNT(*) AS line_count
  FROM transaction_lines
  WHERE transaction_id = $1`

export const updateTransactionSummarySql = `UPDATE transactions
    SET total_amount = $3,
        volume = $4,
        fuel_type = $5,
        tank_id = $6::uuid,
        nozzle_id = $7::uuid,
        nozzle_number = $8,
        grade_id = $9,
        grade_name = $10,
        updated_at = NOW()
  WHERE station_id = $1
    AND id = $2`

export const getTransactionForUpdateSql = `SELECT id,
        status,
        deleted_at,
        pump_number,
        total_amount,
        tank_id,
        nozzle_id,
        nozzle_number,
        grade_id,
        grade_name,
        fuel_type,
        volume,
        doms_source_system,
        doms_payload_json
   FROM transactions
  WHERE station_id = $1 AND id = $2
  FOR UPDATE`

export const getExistingTransactionLinesForUpdateSql = `SELECT id, product_id
   FROM transaction_lines
  WHERE transaction_id = $1
  ORDER BY created_at ASC, id ASC
  FOR UPDATE`

export const deleteTransactionLinesByProductSql = `DELETE FROM transaction_lines
   WHERE transaction_id = $1
     AND product_id = $2`

export const updateTransactionLineSql = `UPDATE transaction_lines
    SET quantity = $3,
        unit_price = $4,
        updated_at = NOW()
  WHERE id = $1
    AND transaction_id = $2`

export const deleteDuplicateTransactionLinesSql = `DELETE FROM transaction_lines
   WHERE transaction_id = $1
     AND id = ANY($2::uuid[])`

export const insertTransactionLineSql = `INSERT INTO transaction_lines (
  id,
  transaction_id,
  product_id,
  quantity,
  unit_price,
  created_at,
  updated_at
) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`

export const countRemainingTransactionLinesSql = `SELECT COUNT(*) AS line_count
   FROM transaction_lines
  WHERE transaction_id = $1`

export const insertManualTransactionSql = `INSERT INTO transactions (
  id,
  station_id,
  pump_number,
  transaction_date_time,
  total_amount,
  volume,
  fuel_type,
  pos_reference,
  status,
  auto_fiscalized,
  retry_count,
  tank_id,
  nozzle_id,
  nozzle_number,
  grade_id,
  grade_name,
  created_at,
  updated_at
) VALUES (
  $1,
  $2,
  $3,
  COALESCE(NULLIF($4, '')::timestamptz, NOW()),
  $5,
  $6,
  $7,
  NULLIF($8, ''),
  'OPEN',
  FALSE,
  0,
  $9::uuid,
  $10::uuid,
  $11,
  $12,
  $13,
  NOW(),
  NOW()
)`

export const getStationCountrySql = `SELECT id, country FROM fuel_stations WHERE id = $1`

export const getDefaultTaxTypeSql = `SELECT code, rate
   FROM cfg_tax_types
   WHERE is_active = TRUE
   ORDER BY sort_order ASC, name ASC
   LIMIT 1`

export const upsertTransactionQueueSql = `INSERT INTO transaction_queue (id, station_id, status, payload, transaction_id)
 VALUES ($1, $2, 'PENDING', $3::jsonb, $4)
 ON CONFLICT (station_id, transaction_id) WHERE transaction_id IS NOT NULL DO UPDATE
   SET status = 'PENDING',
       payload = EXCLUDED.payload,
       last_error = NULL,
       next_attempt_at = NULL,
       updated_at = NOW()
 RETURNING id, transaction_id`

export const markTransactionSendNowSql = `UPDATE transactions
    SET fiscal_queue_enqueued_at = NOW(),
        linking_window_expires_at = NOW(),
        last_error = NULL,
        status = CASE
                   WHEN status = 'FAILED' THEN 'PENDING'
                   ELSE status
                 END,
        updated_at = NOW()
  WHERE station_id = $1 AND id = $2`

export const insertCreditNoteSql = `INSERT INTO credit_notes (id, station_id, transaction_id, status, reason_code, notes, created_by_name, created_at, updated_at)
 VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, NOW(), NOW())`

export const markTransactionCreditedSql = `UPDATE transactions SET status = 'CREDITED', updated_at = NOW() WHERE station_id = $1 AND id = $2`
