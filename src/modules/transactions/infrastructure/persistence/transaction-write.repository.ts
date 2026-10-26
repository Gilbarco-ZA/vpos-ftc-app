import { query, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { AppError } from '@/src/shared/errors/AppError'
import { shortenUUID } from '@/src/shared/utils/shortenUUID'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { reconcileTransactionStockRepo } from '@/src/modules/stock/infrastructure/stock.repository'
import { isFuelLikeProduct } from '@/src/modules/transactions/domain/product-classification'
import { findPumpTransactionLineViolation } from '@/src/modules/transactions/domain/pump-transaction-line-policy'
import {
  getTransactionItemEditability,
  isPumpRecordedFuelTransaction,
  isTransactionItemStatusEditable,
} from '@/src/modules/transactions/domain/transaction-editability'

import type {
  FuelSelectionInput,
  ManualTransactionInput,
  TransactionMutationActor,
  TransactionVehicleDetailsInput,
  UpsertTransactionLineInput,
} from './transaction.types'
import { enqueueTransactionQueueRepo } from './transaction-queue.repository'
import {
  allocateTransactionRepo,
  transactionStatusService,
} from './transaction-status.repository'
import { toFiniteNumber } from './transaction.mapper'
import {
  countRemainingTransactionLinesSql,
  deleteDuplicateTransactionLinesSql,
  deleteTransactionLinesByProductSql,
  getExistingTransactionLinesForUpdateSql,
  getTransactionForUpdateSql,
  insertCreditNoteSql,
  insertManualTransactionSql,
  insertTransactionLineSql,
  loadValidatedProductsSql,
  markTransactionSendNowSql,
  recalcTransactionTotalsSql,
  updateTransactionLineSql,
  updateTransactionSummarySql,
} from './transaction.sql'

type ValidatedProductRow = {
  id: string
  unit_price: number | string | null
  product_name?: string | null
  product_code?: string | null
  tax_code?: string | null
  tax_rate?: number | string | null
  category?: string | null
  category_name?: string | null
}

type NormalizedTransactionLine = {
  productId: string
  quantity: number
  unitPrice: number
  taxCode: string | null
  taxRate: number | null
  product: ValidatedProductRow
}

type FuelSummaryState = {
  hasFuel: boolean
  tankId: string | null
  nozzleId: string | null
  nozzleNumber: number | null
  gradeId: string | null
  gradeName: string | null
  fuelType: string | null
  volume: number | null
}

type TransactionForUpdateRow = {
  id: string
  status?: string | null
  deleted_at?: string | null
  pump_number?: number | null
  total_amount?: number | string | null
  tank_id?: string | null
  nozzle_id?: string | null
  nozzle_number?: number | null
  grade_id?: string | null
  grade_name?: string | null
  fuel_type?: string | null
  volume?: number | string | null
  doms_source_system?: string | null
  doms_payload_json?: unknown
}

type SyntheticFuelLine = {
  productId: string
  quantity: number
  unitPrice: number
  taxCode: string | null
  taxRate: number | null
  tankId: string | null
  nozzleId: string | null
  nozzleNumber: number | null
  gradeId: string | null
  gradeName: string | null
}

const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

const cleanUuidLike = (value: unknown) => {
  const text = cleanText(value)
  return text && text !== 'null' && text !== 'undefined' ? text : null
}

const parseNullableNumber = (value: unknown) => {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const loadValidatedProducts = async (
  client: any,
  stationId: string,
  productIds: string[],
): Promise<ValidatedProductRow[]> => {
  const rows = await txQuery<ValidatedProductRow>(
    client,
    loadValidatedProductsSql,
    [stationId, productIds],
  )
  return rows.rows
}

const parseJsonObject = (value: unknown): Record<string, any> | null => {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>
  }

  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null
  } catch {
    return null
  }
}

const roundUnitPrice = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return 0
  return Number(value.toFixed(6))
}

const resolveSyntheticFuelLine = async (
  client: any,
  stationId: string,
  current: TransactionForUpdateRow,
): Promise<SyntheticFuelLine | null> => {
  const quantity = parseNullableNumber(current.volume)
  if (!Number.isFinite(quantity) || Number(quantity) <= 0) {
    return null
  }

  const payload = parseJsonObject(current.doms_payload_json)
  const tankIdHint = cleanUuidLike(current.tank_id)
  const nozzleIdHint =
    cleanUuidLike(current.nozzle_id) ??
    cleanUuidLike(payload?.nozzleId) ??
    cleanUuidLike(payload?.nozzle_id)
  const nozzleNumberHint =
    parseNullableNumber(current.nozzle_number) ??
    parseNullableNumber(payload?.nozzleNumber) ??
    parseNullableNumber(payload?.nozzle_number)
  const pumpNumberHint = parseNullableNumber(current.pump_number)
  const gradeIdHint = cleanText(current.grade_id)
  const gradeNameHint =
    cleanText(current.grade_name) ??
    cleanText(current.fuel_type) ??
    cleanText(payload?.gradeName) ??
    cleanText(payload?.fuelType) ??
    cleanText(payload?.fuel_type)

  const mapped = await txQuery<any>(
    client,
    `SELECT pr.id,
            pr.product_name,
            pr.product_code,
            COALESCE(pr.ext_unit_price, pr.unit_price, 0) AS unit_price,
            COALESCE(pr.ext_tax_code, pr.tax_code) AS tax_code,
            pr.tax_rate,
            t.id AS tank_id,
            n.id AS nozzle_id,
            n.nozzle_number
       FROM products pr
       LEFT JOIN tanks t
         ON t.product_id = pr.id
        AND t.station_id = pr.station_id
       LEFT JOIN nozzles n
         ON n.tank_id = t.id
        AND n.station_id = t.station_id
        AND n.is_active = TRUE
       LEFT JOIN pumps p
         ON p.id = n.pump_id
        AND p.station_id = n.station_id
        AND p.status <> 'INACTIVE'
      WHERE pr.station_id = $1
        AND (
          ($2::text IS NOT NULL AND t.id::text = $2::text)
          OR ($3::text IS NOT NULL AND n.id::text = $3::text)
          OR (
            $4::int IS NOT NULL
            AND p.pump_number = $4::int
            AND ($5::int IS NULL OR n.nozzle_number = $5::int)
          )
        )
      ORDER BY CASE WHEN $3::text IS NOT NULL AND n.id::text = $3::text THEN 0 ELSE 1 END,
               CASE WHEN $2::text IS NOT NULL AND t.id::text = $2::text THEN 0 ELSE 1 END,
               CASE WHEN $5::int IS NOT NULL AND n.nozzle_number = $5::int THEN 0 ELSE 1 END,
               n.nozzle_number ASC NULLS LAST,
               pr.product_name ASC,
               pr.product_code ASC
      LIMIT 1`,
    [stationId, tankIdHint, nozzleIdHint, pumpNumberHint, nozzleNumberHint],
  )

  let product = mapped.rows[0] ?? null

  if (!product && (gradeIdHint || gradeNameHint)) {
    const fallback = await txQuery<any>(
      client,
      `SELECT pr.id,
              pr.product_name,
              pr.product_code,
              COALESCE(pr.ext_unit_price, pr.unit_price, 0) AS unit_price,
              COALESCE(pr.ext_tax_code, pr.tax_code) AS tax_code,
              pr.tax_rate,
              t.id AS tank_id,
              n.id AS nozzle_id,
              n.nozzle_number
         FROM products pr
         LEFT JOIN tanks t
           ON t.product_id = pr.id
          AND t.station_id = pr.station_id
         LEFT JOIN nozzles n
           ON n.tank_id = t.id
          AND n.station_id = t.station_id
          AND n.is_active = TRUE
        WHERE pr.station_id = $1
          AND (
            ($2::text IS NOT NULL AND (
              pr.id::text = $2::text
              OR pr.product_id = $2::text
              OR pr.product_code = $2::text
            ))
            OR (
              $3::text IS NOT NULL
              AND (
                LOWER(COALESCE(pr.product_name, '')) = LOWER($3::text)
                OR LOWER(COALESCE(pr.product_code, '')) = LOWER($3::text)
              )
            )
          )
        ORDER BY CASE WHEN $2::text IS NOT NULL AND pr.product_id = $2::text THEN 0 ELSE 1 END,
                 CASE WHEN $2::text IS NOT NULL AND pr.product_code = $2::text THEN 0 ELSE 1 END,
                 CASE WHEN $3::text IS NOT NULL AND LOWER(COALESCE(pr.product_name, '')) = LOWER($3::text) THEN 0 ELSE 1 END,
                 CASE WHEN UPPER(COALESCE(pr.category, '')) = 'FUEL' THEN 0 ELSE 1 END,
                 pr.product_name ASC,
                 pr.product_code ASC
        LIMIT 1`,
      [stationId, gradeIdHint, gradeNameHint],
    )
    product = fallback.rows[0] ?? null
  }

  if (!product?.id) {
    return null
  }

  const totalAmount = parseNullableNumber(current.total_amount)
  const computedUnitPrice =
    Number.isFinite(totalAmount) &&
    Number(totalAmount) >= 0 &&
    Number(quantity) > 0
      ? Number(totalAmount) / Number(quantity)
      : toFiniteNumber(product.unit_price, 0)

  return {
    productId: String(product.id),
    quantity: Number(quantity),
    unitPrice: roundUnitPrice(computedUnitPrice),
    taxCode: cleanText(product.tax_code),
    taxRate: parseNullableNumber(product.tax_rate),
    tankId: cleanUuidLike(product.tank_id) ?? tankIdHint,
    nozzleId: cleanUuidLike(product.nozzle_id) ?? nozzleIdHint,
    nozzleNumber:
      parseNullableNumber(product.nozzle_number) ?? nozzleNumberHint,
    gradeId:
      gradeIdHint ?? cleanText(product.product_code) ?? cleanText(product.id),
    gradeName:
      gradeNameHint ??
      cleanText(product.product_name) ??
      cleanText(product.product_code) ??
      'Fuel',
  }
}

const seedMissingFuelLine = async (
  client: any,
  stationId: string,
  transactionId: string,
  current: TransactionForUpdateRow,
  syntheticFuelLine: SyntheticFuelLine,
) => {
  await txQuery(client, insertTransactionLineSql, [
    uuidv4(),
    transactionId,
    syntheticFuelLine.productId,
    syntheticFuelLine.quantity,
    syntheticFuelLine.unitPrice,
    syntheticFuelLine.taxCode,
    syntheticFuelLine.taxRate,
  ])

  await txQuery(client, updateTransactionSummarySql, [
    stationId,
    transactionId,
    toFiniteNumber(
      current.total_amount,
      syntheticFuelLine.quantity * syntheticFuelLine.unitPrice,
    ),
    parseNullableNumber(current.volume) ?? syntheticFuelLine.quantity,
    cleanText(current.fuel_type) ?? syntheticFuelLine.gradeName,
    cleanUuidLike(current.tank_id) ?? syntheticFuelLine.tankId,
    cleanUuidLike(current.nozzle_id) ?? syntheticFuelLine.nozzleId,
    parseNullableNumber(current.nozzle_number) ??
      syntheticFuelLine.nozzleNumber,
    cleanText(current.grade_id) ?? syntheticFuelLine.gradeId,
    cleanText(current.grade_name) ?? syntheticFuelLine.gradeName,
  ])
}

export async function ensureTransactionFuelLineRepo(
  stationId: string,
  transactionId: string,
) {
  return await withTransaction(async (client) => {
    const transaction = await txQuery<TransactionForUpdateRow>(
      client,
      getTransactionForUpdateSql,
      [stationId, transactionId],
    )
    const current = transaction.rows[0]
    if (!current) throw new Error('Transaction not found')

    const existingRows = await txQuery<any>(
      client,
      getExistingTransactionLinesForUpdateSql,
      [transactionId, stationId],
    )
    const pumpRecorded = isPumpRecordedFuelTransaction(current)
    const hasExistingFuelLine = existingRows.rows.some((row: any) =>
      isFuelLikeProduct(row),
    )

    if (
      existingRows.rows.length > 0 &&
      (!pumpRecorded || hasExistingFuelLine)
    ) {
      return { inserted: false, reason: 'existing-lines' }
    }

    const syntheticFuelLine = await resolveSyntheticFuelLine(
      client,
      stationId,
      current,
    )
    if (!syntheticFuelLine) {
      return { inserted: false, reason: 'no-fuel-mapping' }
    }

    await seedMissingFuelLine(
      client,
      stationId,
      transactionId,
      current,
      syntheticFuelLine,
    )

    return {
      inserted: true,
      productId: syntheticFuelLine.productId,
    }
  })
}

const resolveFuelSummaryState = (args: {
  normalizedLines: NormalizedTransactionLine[]
  fuelSelection?: FuelSelectionInput | null
  fallbackFuelSelection?: FuelSelectionInput | null
}) => {
  const fuelLines = args.normalizedLines.filter((line) =>
    isFuelLikeProduct(line.product),
  )

  if (fuelLines.length === 0) {
    return {
      hasFuel: false,
      tankId: null,
      nozzleId: null,
      nozzleNumber: null,
      gradeId: null,
      gradeName: null,
      fuelType: null,
      volume: null,
    } satisfies FuelSummaryState
  }

  const mergedSelection = {
    ...(args.fallbackFuelSelection ?? {}),
    ...(args.fuelSelection ?? {}),
  }

  const tankId = cleanUuidLike(mergedSelection.tankId)
  const nozzleId = cleanUuidLike(mergedSelection.nozzleId)
  const gradeId =
    cleanText(mergedSelection.gradeId) ??
    cleanText(fuelLines[0]?.product.product_code) ??
    cleanText(fuelLines[0]?.product.id)
  const gradeName =
    cleanText(mergedSelection.gradeName) ??
    cleanText(fuelLines[0]?.product.product_name) ??
    cleanText(fuelLines[0]?.product.product_code) ??
    'Fuel'
  const nozzleNumber = parseNullableNumber(mergedSelection.nozzleNumber)
  const volume = Number(
    fuelLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
  )

  if (!tankId || !nozzleId || !gradeId) {
    throw new Error(
      'Fuel transactions require Tank, Nozzle, and Grade before they can be saved.',
    )
  }

  return {
    hasFuel: true,
    tankId,
    nozzleId,
    nozzleNumber,
    gradeId,
    gradeName,
    fuelType: gradeName,
    volume: Number.isFinite(volume) && volume > 0 ? volume : null,
  } satisfies FuelSummaryState
}

const resolvePumpRecordedFuelSummaryState = (args: {
  current: TransactionForUpdateRow
  normalizedLines: NormalizedTransactionLine[]
  syntheticFuelLine?: SyntheticFuelLine | null
}) => {
  const fuelLines = args.normalizedLines.filter((line) =>
    isFuelLikeProduct(line.product),
  )
  const firstFuelLine = fuelLines[0] ?? null
  const calculatedVolume = fuelLines.reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0,
  )
  const volume =
    parseNullableNumber(args.current.volume) ??
    (Number.isFinite(calculatedVolume) && calculatedVolume > 0
      ? calculatedVolume
      : null)
  const gradeId =
    cleanText(args.current.grade_id) ??
    args.syntheticFuelLine?.gradeId ??
    cleanText(firstFuelLine?.product.product_code) ??
    cleanText(firstFuelLine?.product.id)
  const gradeName =
    cleanText(args.current.grade_name) ??
    cleanText(args.current.fuel_type) ??
    args.syntheticFuelLine?.gradeName ??
    cleanText(firstFuelLine?.product.product_name) ??
    cleanText(firstFuelLine?.product.product_code) ??
    'Fuel'

  return {
    hasFuel: fuelLines.length > 0,
    tankId:
      cleanUuidLike(args.current.tank_id) ??
      args.syntheticFuelLine?.tankId ??
      null,
    nozzleId:
      cleanUuidLike(args.current.nozzle_id) ??
      args.syntheticFuelLine?.nozzleId ??
      null,
    nozzleNumber:
      parseNullableNumber(args.current.nozzle_number) ??
      args.syntheticFuelLine?.nozzleNumber ??
      null,
    gradeId,
    gradeName,
    fuelType: cleanText(args.current.fuel_type) ?? gradeName,
    volume,
  } satisfies FuelSummaryState
}

const updateTransactionSummary = async (
  client: any,
  stationId: string,
  transactionId: string,
  fuelState: FuelSummaryState,
) => {
  const totals = await txQuery<any>(client, recalcTransactionTotalsSql, [
    transactionId,
  ])
  const totalAmount = toFiniteNumber(totals.rows[0]?.total_amount, 0)

  await txQuery(client, updateTransactionSummarySql, [
    stationId,
    transactionId,
    totalAmount,
    fuelState.volume,
    fuelState.fuelType,
    fuelState.tankId,
    fuelState.nozzleId,
    fuelState.nozzleNumber,
    fuelState.gradeId,
    fuelState.gradeName,
  ])

  return totalAmount
}

export async function replaceTransactionLinesRepo(
  stationId: string,
  transactionId: string,
  lines: UpsertTransactionLineInput[],
  actor: TransactionMutationActor,
  removedProductIds: string[] = [],
  fuelSelection?: FuelSelectionInput | null,
) {
  return await withTransaction(async (client) => {
    const transaction = await txQuery<TransactionForUpdateRow>(
      client,
      getTransactionForUpdateSql,
      [stationId, transactionId],
    )
    const current = transaction.rows[0]
    if (!current) throw new Error('Transaction not found')

    const status = String(current.status || '')
      .trim()
      .toUpperCase()
    if (!isTransactionItemStatusEditable(status)) {
      throw new AppError(
        'CONFLICT',
        'Only non-fiscalized pending transactions can be edited.',
        409,
        { transactionId, status },
      )
    }

    const editability = getTransactionItemEditability(current)
    if (!editability.editable) {
      throw new AppError(
        'CONFLICT',
        editability.reason ?? 'Transaction items cannot be edited.',
        409,
        {
          code: editability.code,
          transactionId,
        },
      )
    }

    const pumpRecorded = isPumpRecordedFuelTransaction(current)
    const normalizedLines = Array.isArray(lines) ? lines : []
    const removedProductIdSet = new Set(
      removedProductIds
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )

    let existingRows = await txQuery<any>(
      client,
      getExistingTransactionLinesForUpdateSql,
      [transactionId, stationId],
    )
    const syntheticFuelLine = await resolveSyntheticFuelLine(
      client,
      stationId,
      current,
    )

    if (
      pumpRecorded &&
      !existingRows.rows.some((row: any) => isFuelLikeProduct(row)) &&
      syntheticFuelLine
    ) {
      await seedMissingFuelLine(
        client,
        stationId,
        transactionId,
        current,
        syntheticFuelLine,
      )
      existingRows = await txQuery<any>(
        client,
        getExistingTransactionLinesForUpdateSql,
        [transactionId, stationId],
      )
    }

    const lockedFuelRows = pumpRecorded
      ? existingRows.rows.filter((row: any) => isFuelLikeProduct(row))
      : []
    const lockedFuelByProductId = new Map(
      lockedFuelRows.map((row: any) => [String(row.product_id), row] as const),
    )

    if (pumpRecorded && lockedFuelByProductId.size === 0) {
      throw new AppError(
        'CONFLICT',
        'The pump-recorded fuel item could not be resolved. Configure the matching fuel product before adding other products.',
        409,
        {
          code: 'PUMP_RECORDED_FUEL_ITEM_UNRESOLVED',
          transactionId,
        },
      )
    }

    const uniqueProductIds = Array.from(
      new Set(
        [
          ...normalizedLines.map((line) =>
            String(line?.productId || '').trim(),
          ),
          ...lockedFuelRows.map((row: any) => String(row.product_id || '')),
          syntheticFuelLine?.productId ?? '',
        ].filter(Boolean),
      ),
    )
    const validatedProducts = await loadValidatedProducts(
      client,
      stationId,
      uniqueProductIds,
    )
    const validatedProductsById = new Map(
      validatedProducts.map((product) => [String(product.id), product]),
    )

    const normalized: NormalizedTransactionLine[] = normalizedLines.map(
      (line) => {
        const productId = String(line?.productId || '').trim()
        if (!productId) throw new Error('Each line requires a productId')
        const product = validatedProductsById.get(productId)
        if (!product) {
          throw new Error(`Product ${productId} was not found for this station`)
        }

        const quantity = Number(line?.quantity)
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error('Line quantities must be greater than zero')
        }

        const fallbackUnitPrice = toFiniteNumber(product.unit_price, 0)
        const requestedUnitPrice =
          line?.unitPrice == null ? fallbackUnitPrice : Number(line.unitPrice)
        if (!Number.isFinite(requestedUnitPrice) || requestedUnitPrice < 0) {
          throw new Error('Line prices cannot be negative')
        }

        return {
          productId,
          quantity,
          unitPrice: requestedUnitPrice,
          taxCode: cleanText(product.tax_code),
          taxRate: parseNullableNumber(product.tax_rate),
          product,
        } satisfies NormalizedTransactionLine
      },
    )

    if (pumpRecorded) {
      const violation = findPumpTransactionLineViolation({
        existingFuelLines: lockedFuelRows.map((row: any) => ({
          productId: String(row.product_id || ''),
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          isFuel: true,
        })),
        requestedLines: normalized.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          isFuel: isFuelLikeProduct(line.product),
        })),
        removedProductIds: Array.from(removedProductIdSet),
      })

      if (violation?.code === 'PUMP_RECORDED_FUEL_ADDITION_BLOCKED') {
        throw new AppError(
          'CONFLICT',
          'Additional fuel products cannot be added to a pump-recorded transaction.',
          409,
          {
            code: violation.code,
            transactionId,
            productId: violation.productId,
          },
        )
      }

      if (violation?.code === 'PUMP_RECORDED_FUEL_ITEM_IMMUTABLE') {
        throw new AppError(
          'CONFLICT',
          'The pump-recorded fuel item cannot be changed or removed.',
          409,
          {
            code: violation.code,
            transactionId,
            productId: violation.productId,
          },
        )
      }
    }

    const hasRequestedFuelLine = normalized.some((line) =>
      isFuelLikeProduct(line.product),
    )
    if (
      !pumpRecorded &&
      syntheticFuelLine &&
      !hasRequestedFuelLine &&
      !removedProductIdSet.has(syntheticFuelLine.productId)
    ) {
      const product = validatedProductsById.get(syntheticFuelLine.productId)
      if (product) {
        normalized.push({
          productId: syntheticFuelLine.productId,
          quantity: syntheticFuelLine.quantity,
          unitPrice: syntheticFuelLine.unitPrice,
          taxCode: cleanText(product.tax_code),
          taxRate: parseNullableNumber(product.tax_rate),
          product,
        })
      }
    }

    if (normalized.length === 0) {
      throw new Error('At least one transaction line is required')
    }

    const fuelState = pumpRecorded
      ? resolvePumpRecordedFuelSummaryState({
          current,
          normalizedLines: normalized,
          syntheticFuelLine,
        })
      : resolveFuelSummaryState({
          normalizedLines: normalized,
          fuelSelection,
          fallbackFuelSelection: {
            tankId: current.tank_id ?? syntheticFuelLine?.tankId,
            nozzleId: current.nozzle_id ?? syntheticFuelLine?.nozzleId,
            nozzleNumber:
              current.nozzle_number ?? syntheticFuelLine?.nozzleNumber,
            gradeId: current.grade_id ?? syntheticFuelLine?.gradeId,
            gradeName: current.grade_name ?? syntheticFuelLine?.gradeName,
          },
        })

    const existingByProductId = new Map<string, any>()
    for (const row of existingRows.rows) {
      const productId = String(row.product_id || '')
      if (productId && !existingByProductId.has(productId)) {
        existingByProductId.set(productId, row)
      }
    }

    for (const productId of removedProductIds) {
      const scopedProductId = String(productId || '').trim()
      if (!scopedProductId || lockedFuelByProductId.has(scopedProductId)) {
        continue
      }
      await txQuery(client, deleteTransactionLinesByProductSql, [
        transactionId,
        scopedProductId,
      ])
    }

    const retainedLineIds = new Set<string>()

    for (const line of normalized) {
      const existing = existingByProductId.get(line.productId)
      if (existing?.id) {
        retainedLineIds.add(String(existing.id))
        if (!lockedFuelByProductId.has(line.productId)) {
          await txQuery(client, updateTransactionLineSql, [
            existing.id,
            transactionId,
            line.quantity,
            line.unitPrice,
            line.taxCode,
            line.taxRate,
          ])
        }
      } else {
        await txQuery(client, insertTransactionLineSql, [
          uuidv4(),
          transactionId,
          line.productId,
          line.quantity,
          line.unitPrice,
          line.taxCode,
          line.taxRate,
        ])
      }
    }

    const lockedLineIds = new Set(
      lockedFuelRows.map((row: any) => String(row.id || '')).filter(Boolean),
    )
    const existingLineIds = existingRows.rows
      .map((row: any) => String(row.id || '').trim())
      .filter(Boolean)
    const removableLineIds = existingLineIds.filter(
      (lineId) => !retainedLineIds.has(lineId) && !lockedLineIds.has(lineId),
    )
    for (const lineId of removableLineIds) {
      await txQuery(client, deleteDuplicateTransactionLinesSql, [
        transactionId,
        [lineId],
      ])
    }

    const remainingRows = await txQuery<any>(
      client,
      countRemainingTransactionLinesSql,
      [transactionId],
    )
    const remainingCount = Number(remainingRows.rows[0]?.line_count ?? 0)
    if (remainingCount <= 0) {
      throw new Error('At least one transaction line is required')
    }

    const totalAmount = await updateTransactionSummary(
      client,
      stationId,
      transactionId,
      fuelState,
    )

    const stockMovementIds = await reconcileTransactionStockRepo(client, {
      stationId,
      transactionId,
      lines: normalized.map((line) => ({
        productRecordId: line.productId,
        quantity: line.quantity,
      })),
      action: 'EDIT',
      effectiveAt: new Date().toISOString(),
      actor,
    })

    return {
      success: true,
      transactionId,
      totalAmount,
      lineCount: remainingCount,
      stockMovementIds,
      fuelSelection: fuelState.hasFuel
        ? {
            tankId: fuelState.tankId,
            nozzleId: fuelState.nozzleId,
            nozzleNumber: fuelState.nozzleNumber,
            gradeId: fuelState.gradeId,
            gradeName: fuelState.gradeName,
          }
        : null,
    }
  })
}

export async function createManualTransactionRepo(
  stationId: string,
  input: ManualTransactionInput,
  actor: TransactionMutationActor,
) {
  return await withTransaction(async (client) => {
    const normalizedLines = Array.isArray(input.lines) ? input.lines : []
    if (normalizedLines.length === 0) {
      throw new Error('At least one transaction line is required')
    }

    const uniqueProductIds = Array.from(
      new Set(
        normalizedLines
          .map((line) => String(line?.productId || '').trim())
          .filter(Boolean),
      ),
    )

    const validatedProducts = await loadValidatedProducts(
      client,
      stationId,
      uniqueProductIds,
    )
    const validatedProductsById = new Map(
      validatedProducts.map((product) => [String(product.id), product]),
    )

    const transactionId = uuidv4()
    const normalized = normalizedLines.map((line) => {
      const productId = String(line?.productId || '').trim()
      if (!productId) throw new Error('Each line requires a productId')
      const product = validatedProductsById.get(productId)
      if (!product) {
        throw new Error(`Product ${productId} was not found for this station`)
      }
      const quantity = Number(line?.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Line quantities must be greater than zero')
      }
      const fallbackUnitPrice = toFiniteNumber(product.unit_price, 0)
      const unitPrice =
        line?.unitPrice == null ? fallbackUnitPrice : Number(line.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('Line prices cannot be negative')
      }
      return {
        productId: String(line.productId),
        quantity,
        unitPrice,
        taxCode: cleanText(product.tax_code),
        taxRate: parseNullableNumber(product.tax_rate),
        product,
      } satisfies NormalizedTransactionLine
    })

    const fuelState = resolveFuelSummaryState({
      normalizedLines: normalized,
      fuelSelection: input.fuelSelection,
    })

    const generatedPosReference = shortenUUID(transactionId)

    const totalAmount = normalized.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    )
    const primaryProduct = normalized[0]?.product
    const transactionDateTime = String(input.transactionDateTime || '').trim()

    await txQuery(client, insertManualTransactionSql, [
      transactionId,
      stationId,
      Number.isFinite(Number(input.pumpNumber)) ? Number(input.pumpNumber) : 0,
      transactionDateTime,
      totalAmount,
      fuelState.volume,
      fuelState.fuelType ??
        (normalized.length > 1
          ? 'Mixed sale'
          : String(primaryProduct?.product_name || 'Manual sale')),
      String(input.posReference || '')
        .trim()
        .toUpperCase() || generatedPosReference,
      fuelState.tankId,
      fuelState.nozzleId,
      fuelState.nozzleNumber,
      fuelState.gradeId,
      fuelState.gradeName,
    ])

    for (const line of normalized) {
      await txQuery(client, insertTransactionLineSql, [
        uuidv4(),
        transactionId,
        line.productId,
        line.quantity,
        line.unitPrice,
        line.taxCode,
        line.taxRate,
      ])
    }

    const effectiveAt = (() => {
      const parsed = new Date(transactionDateTime)
      return Number.isNaN(parsed.getTime())
        ? new Date().toISOString()
        : parsed.toISOString()
    })()
    const stockMovementIds = await reconcileTransactionStockRepo(client, {
      stationId,
      transactionId,
      lines: normalized.map((line) => ({
        productRecordId: line.productId,
        quantity: line.quantity,
      })),
      action: 'CAPTURE',
      effectiveAt,
      actor,
    })

    return {
      transactionId,
      totalAmount,
      lineCount: normalized.length,
      stockMovementIds,
      fuelSelection: fuelState.hasFuel
        ? {
            tankId: fuelState.tankId,
            nozzleId: fuelState.nozzleId,
            nozzleNumber: fuelState.nozzleNumber,
            gradeId: fuelState.gradeId,
            gradeName: fuelState.gradeName,
          }
        : null,
    }
  })
}

export async function markTransactionSendNowRepo(
  stationId: string,
  transactionId: string,
) {
  await query(markTransactionSendNowSql, [stationId, transactionId])
  return await enqueueTransactionQueueRepo(stationId, transactionId, {
    sendNow: true,
  })
}

export async function fiscalizeQueuedTransactionRepo(
  stationId: string,
  transactionId: string,
  customer?: any,
  vehicleDetails?: TransactionVehicleDetailsInput | null,
) {
  if (customer?.id) {
    await allocateTransactionRepo(
      stationId,
      transactionId,
      String(customer.id),
      null,
      vehicleDetails ?? null,
    )
  }

  const payload: Record<string, unknown> = customer ? { customer } : {}
  if (vehicleDetails) {
    payload.odometer = cleanText(vehicleDetails.odometer)
    payload.payment_type = cleanText(vehicleDetails.paymentType)
    payload.vehicle_reg_nr = cleanText(vehicleDetails.vehicleRegNr)
  }

  return await enqueueTransactionQueueRepo(stationId, transactionId, payload)
}

export async function fiscalizeTransactionLegacyRepo(
  stationId: string,
  payload: any,
) {
  const transactionId = String(
    payload?.transactionId || payload?.transaction_id || '',
  )
  if (!transactionId) throw new Error('transactionId is required')
  return await fiscalizeQueuedTransactionRepo(
    stationId,
    transactionId,
    payload?.customer ?? null,
    {
      odometer: payload?.odometer,
      paymentType: payload?.paymentType ?? payload?.payment_type,
      vehicleRegNr: payload?.vehicleRegNr ?? payload?.vehicle_reg_nr,
    },
  )
}

export async function createCreditNoteRepo(
  stationId: string,
  transactionId: string,
  input: any,
) {
  const creditNoteId = uuidv4()
  await query(insertCreditNoteSql, [
    creditNoteId,
    stationId,
    transactionId,
    input?.reasonCode ?? input?.reason_code ?? null,
    input?.notes ?? null,
    input?.createdByName ?? input?.created_by_name ?? null,
  ])
  await transactionStatusService.markCredited({
    stationId,
    transactionId,
    client: null,
  })
  await enqueueTransactionQueueRepo(stationId, transactionId, {
    kind: 'CREDIT_NOTE',
    creditNoteId,
    reasonCode: input?.reasonCode ?? input?.reason_code ?? null,
    notes: input?.notes ?? null,
    createdByName: input?.createdByName ?? input?.created_by_name ?? null,
  })
  return { success: true, creditNoteId, transactionId }
}
