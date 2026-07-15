import { query, txQuery, withTransaction } from '@/src/platform/db/postgres'
import { shortenUUID } from '@/src/shared/utils/shortenUUID'
import { uuidv4 } from '@/src/shared/utils/uuid'

import type {
  FuelSelectionInput,
  ManualTransactionInput,
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

const FUEL_PRODUCT_PATTERN =
  /(fuel|petrol|diesel|gasoline|gasolina|kerosene|super|unleaded|octane|lpg|cng|ago|pms)/i

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

const isFuelLikeProduct = (product: ValidatedProductRow | null | undefined) => {
  if (!product) return false

  const categoryTokens = [product.category, product.category_name]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase())

  if (categoryTokens.includes('FUEL')) {
    return true
  }

  const haystack = [
    product.product_name,
    product.product_code,
    product.category,
    product.category_name,
  ]
    .filter(Boolean)
    .join(' ')

  return FUEL_PRODUCT_PATTERN.test(haystack)
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
       LEFT JOIN pumps p
         ON p.id = n.pump_id
        AND p.station_id = n.station_id
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
      [transactionId],
    )
    if (existingRows.rows.length > 0) {
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

    const normalizedLines = Array.isArray(lines) ? lines : []
    const removedProductIdSet = new Set(
      removedProductIds
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )
    const syntheticFuelLine = await resolveSyntheticFuelLine(
      client,
      stationId,
      current,
    )

    const uniqueProductIds = Array.from(
      new Set(
        [
          ...normalizedLines.map((line) =>
            String(line?.productId || '').trim(),
          ),
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

    const hasRequestedFuelLine = normalized.some((line) =>
      isFuelLikeProduct(line.product),
    )
    if (
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

    const fuelState = resolveFuelSummaryState({
      normalizedLines: normalized,
      fuelSelection,
      fallbackFuelSelection: {
        tankId: current.tank_id ?? syntheticFuelLine?.tankId,
        nozzleId: current.nozzle_id ?? syntheticFuelLine?.nozzleId,
        nozzleNumber: current.nozzle_number ?? syntheticFuelLine?.nozzleNumber,
        gradeId: current.grade_id ?? syntheticFuelLine?.gradeId,
        gradeName: current.grade_name ?? syntheticFuelLine?.gradeName,
      },
    })

    const existingRows = await txQuery<any>(
      client,
      getExistingTransactionLinesForUpdateSql,
      [transactionId],
    )
    const existingByProductId = new Map<string, any>()
    for (const row of existingRows.rows) {
      const productId = String(row.product_id || '')
      if (productId && !existingByProductId.has(productId)) {
        existingByProductId.set(productId, row)
      }
    }

    for (const productId of removedProductIds) {
      const scopedProductId = String(productId || '').trim()
      if (!scopedProductId) continue
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
        await txQuery(client, updateTransactionLineSql, [
          existing.id,
          transactionId,
          line.quantity,
          line.unitPrice,
          line.taxCode,
          line.taxRate,
        ])
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

    const existingLineIds = existingRows.rows
      .map((row: any) => String(row.id || '').trim())
      .filter(Boolean)
    const removableLineIds = existingLineIds.filter(
      (lineId) => !retainedLineIds.has(lineId),
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

    return {
      success: true,
      transactionId,
      totalAmount,
      lineCount: remainingCount,
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

    return {
      transactionId,
      totalAmount,
      lineCount: normalized.length,
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
) {
  if (customer?.id) {
    await allocateTransactionRepo(
      stationId,
      transactionId,
      String(customer.id),
      null,
    )
  }
  return await enqueueTransactionQueueRepo(
    stationId,
    transactionId,
    customer ? { customer } : {},
  )
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
