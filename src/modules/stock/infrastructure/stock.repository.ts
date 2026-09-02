import type {
  StockMovementReason,
  StockMovementType,
  StockProxyStatus,
  StockSourceType,
  StockUpdateMode,
} from '@/src/modules/stock/domain/stockMovement'
import type { TransactionStockQuantity } from '@/src/modules/stock/domain/transactionStockReconciliation'
import type { StockPayloadSource } from '@/src/modules/stock/infrastructure/stockPayload'
import type { PoolClient } from 'pg'

import {
  queryAll,
  queryOne,
  txQuery,
  withTransaction,
} from '@/src/platform/db/postgres'
import { AppError } from '@/src/shared/errors/AppError'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  calculateImportedStockAdjustment,
  isFuelProduct,
} from '@/src/modules/stock/domain/stockMovement'
import { buildTransactionStockDeltas } from '@/src/modules/stock/domain/transactionStockReconciliation'

export type StockProductSummary = {
  id: string
  productId: string
  productCode: string
  productName: string
  sku: string | null
  categoryCode: string | null
  categoryName: string | null
  unitOfMeasure: string
  unitCost: number
  currency: string
  availableQuantity: number
  lastMovementAt: string | null
  lastMovementType: StockMovementType | null
  lastProxyStatus: StockProxyStatus | null
  proxyPendingCount: number
  proxyFailedCount: number
}

export type StockMovementRecord = {
  id: string
  productRecordId: string
  productId: string
  productCode: string
  productName: string
  sku: string | null
  categoryCode: string | null
  categoryName: string | null
  unitOfMeasure: string
  movementType: StockMovementType
  reason: string
  quantity: number
  unitCost: number | null
  documentId: string
  documentReference: string | null
  remarks: string | null
  supplierName: string | null
  supplierPin: string | null
  supplierInvoiceNumber: string | null
  effectiveAt: string
  createdByUserId: string | null
  createdByName: string
  sourceType: StockSourceType
  sourceTransactionId: string | null
  sourceAction: 'CAPTURE' | 'EDIT' | null
  proxyStatus: StockProxyStatus
  proxyResponse: unknown
  proxySentAt: string | null
  proxyError: string | null
  createdAt: string
  updatedAt: string
}

export type TransactionStockLine = {
  productRecordId: string
  quantity: number
}

export type TransactionStockActor = {
  userId: string
  name: string
}

type ProductForMovement = {
  id: string
  product_id: string
  product_code: string
  product_name: string
  sku: string | null
  unit_cost: string | number | null
  currency: string
  category: string | null
  category_code: string | null
  category_name: string | null
  unit_of_measure: string | null
  unit_of_packaging: string | null
  hazardous_indicator: boolean | null
  tax_code: string | null
  tax_rate: string | number | null
  ext_product_id: string | null
  ext_product_code: string | null
  ext_product_class_code: string | null
  product_class_code: string | null
  ext_product_type_code: string | null
  product_type_code: string | null
  ext_description: string | null
  ext_unit_of_measure: string | null
  ext_unit_of_packaging: string | null
  ext_hazardous_indicator: boolean | null
  ext_tax_code: string | null
}

const toIso = (value: unknown): string | null => {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const mapProductSummary = (
  row: Record<string, unknown>,
): StockProductSummary => ({
  id: String(row.id ?? ''),
  productId: String(row.product_id ?? ''),
  productCode: String(row.product_code ?? ''),
  productName: String(row.product_name ?? ''),
  sku: row.sku == null ? null : String(row.sku),
  categoryCode: row.category_code == null ? null : String(row.category_code),
  categoryName: row.category_name == null ? null : String(row.category_name),
  unitOfMeasure: String(row.unit_of_measure ?? 'EACH'),
  unitCost: toNumber(row.unit_cost),
  currency: String(row.currency ?? ''),
  availableQuantity: toNumber(row.available_quantity),
  lastMovementAt: toIso(row.last_movement_at),
  lastMovementType: row.last_movement_type
    ? (String(row.last_movement_type) as StockMovementType)
    : null,
  lastProxyStatus: row.last_proxy_status
    ? (String(row.last_proxy_status) as StockProxyStatus)
    : null,
  proxyPendingCount: toNumber(row.proxy_pending_count),
  proxyFailedCount: toNumber(row.proxy_failed_count),
})

const mapMovement = (row: Record<string, unknown>): StockMovementRecord => ({
  id: String(row.id ?? ''),
  productRecordId: String(row.product_record_id ?? ''),
  productId: String(row.product_id ?? ''),
  productCode: String(row.product_code ?? ''),
  productName: String(row.product_name ?? ''),
  sku: row.sku == null ? null : String(row.sku),
  categoryCode: row.category_code == null ? null : String(row.category_code),
  categoryName: row.category_name == null ? null : String(row.category_name),
  unitOfMeasure: String(row.unit_of_measure ?? 'EACH'),
  movementType: String(row.movement_type) as StockMovementType,
  reason: String(row.reason_code ?? ''),
  quantity: toNumber(row.quantity),
  unitCost: row.unit_cost == null ? null : toNumber(row.unit_cost),
  documentId: String(row.document_id ?? ''),
  documentReference:
    row.document_reference == null ? null : String(row.document_reference),
  remarks: row.remarks == null ? null : String(row.remarks),
  supplierName: row.supplier_name == null ? null : String(row.supplier_name),
  supplierPin: row.supplier_pin == null ? null : String(row.supplier_pin),
  supplierInvoiceNumber:
    row.supplier_invoice_number == null
      ? null
      : String(row.supplier_invoice_number),
  effectiveAt: toIso(row.effective_at) ?? new Date(0).toISOString(),
  createdByUserId:
    row.created_by_user_id == null ? null : String(row.created_by_user_id),
  createdByName: String(row.created_by_name ?? ''),
  sourceType: String(row.source_type ?? 'MANUAL') as StockSourceType,
  sourceTransactionId:
    row.source_transaction_id == null
      ? null
      : String(row.source_transaction_id),
  sourceAction: row.source_action
    ? (String(row.source_action) as 'CAPTURE' | 'EDIT')
    : null,
  proxyStatus: String(row.proxy_status ?? 'PENDING') as StockProxyStatus,
  proxyResponse: row.proxy_response ?? null,
  proxySentAt: toIso(row.proxy_sent_at),
  proxyError: row.proxy_error == null ? null : String(row.proxy_error),
  createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
})

const movementSelect = `
  SELECT pim.*,
         p.product_id,
         p.product_code,
         p.product_name,
         p.sku,
         COALESCE(pc.code, NULL) AS category_code,
         COALESCE(pc.name, p.category) AS category_name,
         COALESCE(p.unit_of_measure, p.ext_unit_of_measure, 'EACH') AS unit_of_measure
    FROM product_inventory_movements pim
    INNER JOIN products p
      ON p.id = pim.product_record_id
     AND p.station_id = pim.station_id
    LEFT JOIN product_categories pc
      ON pc.id = p.category_id
     AND pc.station_id = p.station_id
`

export async function listStockProductsRepo(
  stationId: string,
): Promise<StockProductSummary[]> {
  const rows = await queryAll<Record<string, unknown>>(
    `WITH movement_summary AS (
       SELECT product_record_id,
              COALESCE(SUM(
                CASE
                  WHEN movement_type = 'STOCK_IN' THEN quantity
                  WHEN movement_type = 'STOCK_OUT' THEN -quantity
                  ELSE 0
                END
              ), 0) AS available_quantity,
              MAX(effective_at) AS last_movement_at,
              COUNT(*) FILTER (WHERE proxy_status = 'PENDING')::int AS proxy_pending_count,
              COUNT(*) FILTER (WHERE proxy_status = 'FAILED')::int AS proxy_failed_count
         FROM product_inventory_movements
        WHERE station_id = $1
        GROUP BY product_record_id
     ), latest_movement AS (
       SELECT DISTINCT ON (product_record_id)
              product_record_id,
              movement_type AS last_movement_type,
              proxy_status AS last_proxy_status
         FROM product_inventory_movements
        WHERE station_id = $1
        ORDER BY product_record_id, effective_at DESC, created_at DESC, id DESC
     )
     SELECT p.id,
            p.product_id,
            p.product_code,
            p.product_name,
            p.sku,
            p.unit_cost,
            p.currency,
            p.product_class_code,
            p.ext_product_class_code,
            p.product_type_code,
            p.ext_product_type_code,
            pc.code AS category_code,
            COALESCE(pc.name, p.category) AS category_name,
            p.category AS legacy_category,
            COALESCE(p.unit_of_measure, p.ext_unit_of_measure, 'EACH') AS unit_of_measure,
            COALESCE(ms.available_quantity, 0) AS available_quantity,
            ms.last_movement_at,
            lm.last_movement_type,
            lm.last_proxy_status,
            COALESCE(ms.proxy_pending_count, 0) AS proxy_pending_count,
            COALESCE(ms.proxy_failed_count, 0) AS proxy_failed_count
       FROM products p
       LEFT JOIN product_categories pc
         ON pc.id = p.category_id
        AND pc.station_id = p.station_id
       LEFT JOIN movement_summary ms ON ms.product_record_id = p.id
       LEFT JOIN latest_movement lm ON lm.product_record_id = p.id
      WHERE p.station_id = $1
      ORDER BY p.product_name ASC, p.product_code ASC`,
    [stationId],
  )

  return rows
    .filter(
      (row) =>
        !isFuelProduct({
          categoryCode: row.category_code,
          categoryName: row.category_name,
          legacyCategory: row.legacy_category,
          productClassCode: row.product_class_code,
          externalProductClassCode: row.ext_product_class_code,
          productTypeCode: row.product_type_code,
          externalProductTypeCode: row.ext_product_type_code,
        }),
    )
    .map(mapProductSummary)
}

export async function listStockMovementsRepo(
  stationId: string,
  limit = 250,
): Promise<StockMovementRecord[]> {
  const rows = await queryAll<Record<string, unknown>>(
    `${movementSelect}
     WHERE pim.station_id = $1
     ORDER BY pim.effective_at DESC, pim.created_at DESC, pim.id DESC
     LIMIT $2`,
    [stationId, Math.max(1, Math.min(limit, 500))],
  )

  return rows.map(mapMovement)
}

const selectProductForUpdate = async (
  client: PoolClient,
  stationId: string,
  productRecordId: string,
): Promise<ProductForMovement | null> => {
  const result = await txQuery<ProductForMovement>(
    client,
    `SELECT p.*,
            pc.code AS category_code,
            pc.name AS category_name
       FROM products p
       LEFT JOIN product_categories pc
         ON pc.id = p.category_id
        AND pc.station_id = p.station_id
      WHERE p.station_id = $1
        AND p.id = $2
      FOR UPDATE OF p`,
    [stationId, productRecordId],
  )
  return result.rows[0] ?? null
}

const buildDocumentId = (
  movementType: StockMovementType,
  movementId: string,
  effectiveAt: string,
) => {
  const date = new Date(effectiveAt)
  const datePart = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replaceAll('-', '')
    : date.toISOString().slice(0, 10).replaceAll('-', '')
  const prefix = movementType === 'STOCK_IN' ? 'STI' : 'STO'
  return `${prefix}-${datePart}-${movementId.slice(0, 8).toUpperCase()}`
}

export async function createStockMovementRepo(input: {
  stationId: string
  productRecordId: string
  movementType: StockMovementType
  reason: StockMovementReason
  quantity: number
  unitCost: number | null
  effectiveAt: string
  documentReference: string | null
  remarks: string | null
  supplierName: string | null
  supplierPin: string | null
  supplierInvoiceNumber: string | null
  createdByUserId: string
  createdByName: string
}): Promise<StockMovementRecord> {
  return await withTransaction(async (client) => {
    const product = await selectProductForUpdate(
      client,
      input.stationId,
      input.productRecordId,
    )

    if (!product) {
      throw new AppError('NOT_FOUND', 'Product was not found.', 404)
    }

    if (
      isFuelProduct({
        categoryCode: product.category_code,
        categoryName: product.category_name,
        legacyCategory: product.category,
        productClassCode: product.product_class_code,
        externalProductClassCode: product.ext_product_class_code,
        productTypeCode: product.product_type_code,
        externalProductTypeCode: product.ext_product_type_code,
      })
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Fuel products must be managed through tank stock workflows.',
        400,
      )
    }

    const balanceResult = await txQuery<{ available_quantity: string }>(
      client,
      `SELECT COALESCE(SUM(
                CASE
                  WHEN movement_type = 'STOCK_IN' THEN quantity
                  WHEN movement_type = 'STOCK_OUT' THEN -quantity
                  ELSE 0
                END
              ), 0)::text AS available_quantity
         FROM product_inventory_movements
        WHERE station_id = $1
          AND product_record_id = $2`,
      [input.stationId, input.productRecordId],
    )
    const availableQuantity = toNumber(
      balanceResult.rows[0]?.available_quantity,
    )

    if (
      input.movementType === 'STOCK_OUT' &&
      input.quantity > availableQuantity
    ) {
      throw new AppError(
        'CONFLICT',
        `Stock out exceeds the available quantity of ${availableQuantity}.`,
        409,
        { availableQuantity },
      )
    }

    const id = uuidv4()
    const documentId = buildDocumentId(
      input.movementType,
      id,
      input.effectiveAt,
    )

    const insertResult = await txQuery<Record<string, unknown>>(
      client,
      `INSERT INTO product_inventory_movements (
         id,
         station_id,
         product_record_id,
         movement_type,
         reason_code,
         quantity,
         unit_cost,
         document_id,
         document_reference,
         remarks,
         supplier_name,
         supplier_pin,
         supplier_invoice_number,
         effective_at,
         created_by_user_id,
         created_by_name,
         proxy_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14::timestamptz, $15, $16, 'PENDING'
       )
       RETURNING *`,
      [
        id,
        input.stationId,
        input.productRecordId,
        input.movementType,
        input.reason,
        input.quantity,
        input.unitCost,
        documentId,
        input.documentReference,
        input.remarks,
        input.supplierName,
        input.supplierPin,
        input.supplierInvoiceNumber,
        input.effectiveAt,
        input.createdByUserId,
        input.createdByName,
      ],
    )

    const row = insertResult.rows[0]
    if (!row) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Stock movement could not be saved.',
        500,
      )
    }

    return mapMovement({
      ...row,
      product_id: product.product_id,
      product_code: product.product_code,
      product_name: product.product_name,
      sku: product.sku,
      category_code: product.category_code,
      category_name: product.category_name ?? product.category,
      unit_of_measure:
        product.unit_of_measure ?? product.ext_unit_of_measure ?? 'EACH',
    })
  })
}

export async function reconcileTransactionStockRepo(
  client: PoolClient,
  input: {
    stationId: string
    transactionId: string
    lines: TransactionStockLine[]
    action: 'CAPTURE' | 'EDIT'
    effectiveAt: string
    actor: TransactionStockActor
  },
): Promise<string[]> {
  const rawTarget = new Map<string, number>()
  for (const line of input.lines) {
    const productRecordId = String(line.productRecordId || '').trim()
    const quantity = Number(line.quantity)
    if (!productRecordId || !Number.isFinite(quantity) || quantity <= 0) {
      continue
    }
    rawTarget.set(
      productRecordId,
      Number(((rawTarget.get(productRecordId) ?? 0) + quantity).toFixed(6)),
    )
  }

  const appliedResult = await txQuery<{
    product_record_id: string
    applied_quantity: string | number
  }>(
    client,
    `SELECT product_record_id,
            COALESCE(SUM(
              CASE
                WHEN movement_type = 'STOCK_OUT' THEN quantity
                WHEN movement_type = 'STOCK_IN' THEN -quantity
                ELSE 0
              END
            ), 0) AS applied_quantity
       FROM product_inventory_movements
      WHERE station_id = $1
        AND source_type = 'POS_TRANSACTION'
        AND source_transaction_id = $2
      GROUP BY product_record_id`,
    [input.stationId, input.transactionId],
  )

  const applied: TransactionStockQuantity[] = appliedResult.rows.map(
    (row: {
      product_record_id: string
      applied_quantity: string | number
    }) => ({
      productRecordId: String(row.product_record_id),
      quantity: Math.max(0, toNumber(row.applied_quantity)),
    }),
  )
  const productIds = Array.from(
    new Set([
      ...rawTarget.keys(),
      ...applied.map((row) => row.productRecordId),
    ]),
  ).sort()

  if (productIds.length === 0) return []

  const productResult = await txQuery<ProductForMovement>(
    client,
    `SELECT p.*,
            pc.code AS category_code,
            pc.name AS category_name
       FROM products p
       LEFT JOIN product_categories pc
         ON pc.id = p.category_id
        AND pc.station_id = p.station_id
      WHERE p.station_id = $1
        AND p.id = ANY($2::uuid[])
      ORDER BY p.id ASC
      FOR UPDATE OF p`,
    [input.stationId, productIds],
  )
  const productsById = new Map<string, ProductForMovement>(
    productResult.rows.map(
      (product: ProductForMovement) => [String(product.id), product] as const,
    ),
  )

  const missingProductId = productIds.find(
    (productId) => !productsById.has(productId),
  )
  if (missingProductId) {
    throw new AppError(
      'NOT_FOUND',
      `Product ${missingProductId} was not found for this station.`,
      404,
    )
  }

  const appliedByProductId = new Map<string, number>(
    applied.map(
      (row: TransactionStockQuantity) =>
        [row.productRecordId, row.quantity] as const,
    ),
  )
  const target: TransactionStockQuantity[] = productIds.flatMap(
    (productRecordId): TransactionStockQuantity[] => {
      const product = productsById.get(productRecordId)
      if (!product) return []

      const fuel = isFuelProduct({
        categoryCode: product.category_code,
        categoryName: product.category_name,
        legacyCategory: product.category,
        productClassCode: product.product_class_code,
        externalProductClassCode: product.ext_product_class_code,
        productTypeCode: product.product_type_code,
        externalProductTypeCode: product.ext_product_type_code,
      })
      const alreadyApplied = appliedByProductId.get(productRecordId) ?? 0

      if (fuel && alreadyApplied > 0) {
        throw new AppError(
          'CONFLICT',
          `Product ${product.product_name} is now categorized as Fuel but already has transaction stock movements. Restore its non-fuel category before editing this transaction.`,
          409,
          { productRecordId, transactionId: input.transactionId },
        )
      }

      const quantity = fuel ? 0 : (rawTarget.get(productRecordId) ?? 0)
      return quantity > 0 ? [{ productRecordId, quantity }] : []
    },
  )

  const deltas = buildTransactionStockDeltas({ target, applied })
  if (deltas.length === 0) return []

  const balanceResult = await txQuery<{
    product_record_id: string
    available_quantity: string | number
  }>(
    client,
    `SELECT product_record_id,
            COALESCE(SUM(
              CASE
                WHEN movement_type = 'STOCK_IN' THEN quantity
                WHEN movement_type = 'STOCK_OUT' THEN -quantity
                ELSE 0
              END
            ), 0) AS available_quantity
       FROM product_inventory_movements
      WHERE station_id = $1
        AND product_record_id = ANY($2::uuid[])
      GROUP BY product_record_id`,
    [input.stationId, productIds],
  )
  const availableByProductId = new Map<string, number>(
    balanceResult.rows.map(
      (row: {
        product_record_id: string
        available_quantity: string | number
      }) =>
        [
          String(row.product_record_id),
          toNumber(row.available_quantity),
        ] as const,
    ),
  )

  const movementIds: string[] = []
  for (const delta of deltas) {
    const product = productsById.get(delta.productRecordId)
    if (!product) continue

    const availableQuantity =
      availableByProductId.get(delta.productRecordId) ?? 0
    if (
      delta.movementType === 'STOCK_OUT' &&
      delta.quantity > availableQuantity
    ) {
      throw new AppError(
        'CONFLICT',
        `${product.product_name} requires ${delta.quantity} additional units, but only ${availableQuantity} are available.`,
        409,
        {
          productRecordId: delta.productRecordId,
          requestedQuantity: delta.quantity,
          availableQuantity,
          transactionId: input.transactionId,
        },
      )
    }

    const movementId = uuidv4()
    const documentId = buildDocumentId(
      delta.movementType,
      movementId,
      input.effectiveAt,
    )
    const reason = delta.movementType === 'STOCK_OUT' ? 'Other' : 'Stock Count'
    const actionLabel = input.action === 'CAPTURE' ? 'captured' : 'edited'
    const directionLabel =
      delta.movementType === 'STOCK_OUT' ? 'allocation' : 'correction'

    await txQuery(
      client,
      `INSERT INTO product_inventory_movements (
         id,
         station_id,
         product_record_id,
         movement_type,
         reason_code,
         quantity,
         unit_cost,
         document_id,
         document_reference,
         remarks,
         effective_at,
         created_by_user_id,
         created_by_name,
         source_type,
         source_transaction_id,
         source_action,
         proxy_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11::timestamptz, $12, $13, 'POS_TRANSACTION', $14, $15, 'NOT_REQUIRED'
       )`,
      [
        movementId,
        input.stationId,
        delta.productRecordId,
        delta.movementType,
        reason,
        delta.quantity,
        product.unit_cost,
        documentId,
        input.transactionId,
        `POS transaction ${input.transactionId} ${directionLabel} after it was ${actionLabel}.`,
        input.effectiveAt,
        input.actor.userId,
        input.actor.name,
        input.transactionId,
        input.action,
      ],
    )

    const nextAvailable =
      delta.movementType === 'STOCK_OUT'
        ? availableQuantity - delta.quantity
        : availableQuantity + delta.quantity
    availableByProductId.set(
      delta.productRecordId,
      Number(nextAvailable.toFixed(6)),
    )
    movementIds.push(movementId)
  }

  return movementIds
}

export type ImportedStockAdjustment = {
  movementId: string | null
  previousQuantity: number
  resultingQuantity: number
  movementType: StockMovementType | null
  movementQuantity: number
}

export async function applyImportedStockRepo(
  client: PoolClient,
  input: {
    stationId: string
    productRecordId: string
    stockQuantity: number
    stockUpdateMode: StockUpdateMode
    unitCost: number | null
    effectiveAt: string
    batchReference: string
    actor: TransactionStockActor
  },
): Promise<ImportedStockAdjustment> {
  const product = await selectProductForUpdate(
    client,
    input.stationId,
    input.productRecordId,
  )
  if (!product) {
    throw new AppError('NOT_FOUND', 'Imported product was not found.', 404)
  }

  if (
    isFuelProduct({
      categoryCode: product.category_code,
      categoryName: product.category_name,
      legacyCategory: product.category,
      productClassCode: product.product_class_code,
      externalProductClassCode: product.ext_product_class_code,
      productTypeCode: product.product_type_code,
      externalProductTypeCode: product.ext_product_type_code,
    })
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Fuel product ${product.product_name} cannot include product stock.`,
      400,
    )
  }

  const balanceResult = await txQuery<{ available_quantity: string }>(
    client,
    `SELECT COALESCE(SUM(
              CASE
                WHEN movement_type = 'STOCK_IN' THEN quantity
                WHEN movement_type = 'STOCK_OUT' THEN -quantity
                ELSE 0
              END
            ), 0)::text AS available_quantity
       FROM product_inventory_movements
      WHERE station_id = $1
        AND product_record_id = $2`,
    [input.stationId, input.productRecordId],
  )
  const previousQuantity = toNumber(balanceResult.rows[0]?.available_quantity)
  const calculation = calculateImportedStockAdjustment({
    previousQuantity,
    stockQuantity: input.stockQuantity,
    stockUpdateMode: input.stockUpdateMode,
  })

  if (!calculation.movementType) {
    return {
      movementId: null,
      previousQuantity,
      resultingQuantity: calculation.resultingQuantity,
      movementType: null,
      movementQuantity: 0,
    }
  }

  const movementType = calculation.movementType
  const movementQuantity = calculation.movementQuantity
  if (movementType === 'STOCK_OUT' && movementQuantity > previousQuantity) {
    throw new AppError(
      'CONFLICT',
      `Imported stock adjustment for ${product.product_name} exceeds the available quantity.`,
      409,
      { previousQuantity, requestedQuantity: movementQuantity },
    )
  }

  const movementId = uuidv4()
  const documentId = buildDocumentId(
    movementType,
    movementId,
    input.effectiveAt,
  )
  await txQuery(
    client,
    `INSERT INTO product_inventory_movements (
       id,
       station_id,
       product_record_id,
       movement_type,
       reason_code,
       quantity,
       unit_cost,
       document_id,
       document_reference,
       remarks,
       effective_at,
       created_by_user_id,
       created_by_name,
       source_type,
       proxy_status
     ) VALUES (
       $1, $2, $3, $4, 'Stock Count', $5, $6, $7, $8, $9,
       $10::timestamptz, $11, $12, 'CSV_IMPORT', 'PENDING'
     )`,
    [
      movementId,
      input.stationId,
      input.productRecordId,
      movementType,
      movementQuantity,
      input.unitCost,
      documentId,
      input.batchReference,
      `CSV product import ${input.stockUpdateMode} stock adjustment.`,
      input.effectiveAt,
      input.actor.userId,
      input.actor.name,
    ],
  )

  return {
    movementId,
    previousQuantity,
    resultingQuantity: calculation.resultingQuantity,
    movementType,
    movementQuantity,
  }
}

export async function getStockMovementRepo(
  stationId: string,
  movementId: string,
): Promise<StockMovementRecord | null> {
  const row = await queryOne<Record<string, unknown>>(
    `${movementSelect}
     WHERE pim.station_id = $1 AND pim.id = $2
     LIMIT 1`,
    [stationId, movementId],
  )
  return row ? mapMovement(row) : null
}

export async function getStockMovementPayloadSourceRepo(
  stationId: string,
  movementId: string,
): Promise<StockPayloadSource | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT pim.*,
            COALESCE(p.ext_product_id, p.product_id, p.ext_product_code, p.product_code) AS external_product_id,
            COALESCE(p.ext_product_code, p.product_code) AS external_product_code,
            COALESCE(p.ext_product_class_code, p.product_class_code) AS external_product_class_code,
            COALESCE(p.ext_product_type_code, p.product_type_code) AS external_product_type_code,
            COALESCE(p.ext_description, p.product_name) AS product_description,
            COALESCE(p.ext_unit_of_measure, p.unit_of_measure, 'EACH') AS external_unit_of_measure,
            COALESCE(p.ext_unit_of_packaging, p.unit_of_packaging, '00') AS external_unit_of_packaging,
            COALESCE(p.ext_hazardous_indicator, p.hazardous_indicator, FALSE) AS external_hazardous_indicator,
            COALESCE(p.ext_tax_code, p.tax_code) AS external_tax_code,
            COALESCE(pim.unit_cost, p.unit_cost, p.ext_unit_price, p.unit_price, 0) AS resolved_unit_cost,
            p.tax_rate
       FROM product_inventory_movements pim
       INNER JOIN products p
         ON p.id = pim.product_record_id
        AND p.station_id = pim.station_id
      WHERE pim.station_id = $1
        AND pim.id = $2
      LIMIT 1`,
    [stationId, movementId],
  )

  if (!row) return null

  return {
    id: String(row.id),
    movementType: String(row.movement_type) as StockMovementType,
    reason: String(row.reason_code),
    documentId: String(row.document_id),
    documentReference:
      row.document_reference == null ? null : String(row.document_reference),
    remarks: row.remarks == null ? null : String(row.remarks),
    effectiveAt: toIso(row.effective_at) ?? new Date().toISOString(),
    createdByName: String(row.created_by_name ?? ''),
    supplierName: row.supplier_name == null ? null : String(row.supplier_name),
    supplierPin: row.supplier_pin == null ? null : String(row.supplier_pin),
    supplierInvoiceNumber:
      row.supplier_invoice_number == null
        ? null
        : String(row.supplier_invoice_number),
    quantity: toNumber(row.quantity),
    unitCost: toNumber(row.resolved_unit_cost),
    productId: String(row.external_product_id ?? ''),
    productCode: String(row.external_product_code ?? ''),
    productClassCode:
      row.external_product_class_code == null
        ? null
        : String(row.external_product_class_code),
    productTypeCode:
      row.external_product_type_code == null
        ? null
        : String(row.external_product_type_code),
    description: String(row.product_description ?? ''),
    unitOfMeasure: String(row.external_unit_of_measure ?? 'EACH'),
    unitOfPackaging: String(row.external_unit_of_packaging ?? '00'),
    hazardousIndicator: Boolean(row.external_hazardous_indicator),
    taxCode:
      row.external_tax_code == null ? null : String(row.external_tax_code),
    taxRate: row.tax_rate == null ? null : toNumber(row.tax_rate),
  }
}

export async function updateStockMovementProxyResultRepo(input: {
  stationId: string
  movementId: string
  status: Extract<StockProxyStatus, 'SENT' | 'FAILED'>
  response: unknown
  error: string | null
}): Promise<void> {
  await queryOne(
    `UPDATE product_inventory_movements
        SET proxy_status = $3,
            proxy_response = $4::jsonb,
            proxy_error = $5,
            proxy_sent_at = CASE WHEN $3 = 'SENT' THEN NOW() ELSE proxy_sent_at END,
            updated_at = NOW()
      WHERE station_id = $1
        AND id = $2
      RETURNING id`,
    [
      input.stationId,
      input.movementId,
      input.status,
      JSON.stringify(input.response ?? {}),
      input.error,
    ],
  )
}
