export const STOCK_MOVEMENT_TYPES = ['STOCK_IN', 'STOCK_OUT'] as const

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]

export const STOCK_IN_REASONS = [
  'Delivery',
  'Transfer In',
  'Production',
  'Stock Count',
] as const

export type StockInReason = (typeof STOCK_IN_REASONS)[number]

export const STOCK_OUT_REASONS = [
  'Expired',
  'Damaged',
  'Personal Use',
  'Raw Material',
  'Other',
  'Transfer Out',
  'Waste',
  'Return',
  'Production',
  'Stock Count',
] as const

export type StockOutReason = (typeof STOCK_OUT_REASONS)[number]
export type StockMovementReason = StockInReason | StockOutReason

export const STOCK_PROXY_STATUSES = [
  'PENDING',
  'SENT',
  'FAILED',
  'NOT_REQUIRED',
] as const
export type StockProxyStatus = (typeof STOCK_PROXY_STATUSES)[number]

export const STOCK_SOURCE_TYPES = [
  'MANUAL',
  'POS_TRANSACTION',
  'CSV_IMPORT',
] as const
export type StockSourceType = (typeof STOCK_SOURCE_TYPES)[number]

export const STOCK_UPDATE_MODES = ['SET', 'ADD'] as const
export type StockUpdateMode = (typeof STOCK_UPDATE_MODES)[number]

// POS sales update the local ledger only. The invoice submission applies the
// corresponding cloud stock deduction, so sending a second stock-out would
// double-deduct inventory. Manual and CSV adjustments still use vpos-proxy.
export function stockMovementRequiresProxy(
  sourceType: StockSourceType,
): boolean {
  return sourceType !== 'POS_TRANSACTION'
}

export type ImportedStockCalculation = {
  resultingQuantity: number
  movementType: StockMovementType | null
  movementQuantity: number
}

export function calculateImportedStockAdjustment(input: {
  previousQuantity: number
  stockQuantity: number
  stockUpdateMode: StockUpdateMode
}): ImportedStockCalculation {
  const previousQuantity = Number(input.previousQuantity)
  const stockQuantity = Number(input.stockQuantity)
  if (
    !Number.isFinite(previousQuantity) ||
    previousQuantity < 0 ||
    !Number.isFinite(stockQuantity) ||
    stockQuantity < 0
  ) {
    throw new Error('Stock quantities must be finite, non-negative numbers.')
  }

  const signedDelta =
    input.stockUpdateMode === 'SET'
      ? stockQuantity - previousQuantity
      : stockQuantity
  const roundedDelta = Number(signedDelta.toFixed(6))
  const resultingQuantity = Number((previousQuantity + roundedDelta).toFixed(6))

  if (Math.abs(roundedDelta) < 0.000001) {
    return {
      resultingQuantity: previousQuantity,
      movementType: null,
      movementQuantity: 0,
    }
  }

  return {
    resultingQuantity,
    movementType: roundedDelta > 0 ? 'STOCK_IN' : 'STOCK_OUT',
    movementQuantity: Math.abs(roundedDelta),
  }
}

export type ProductStockClassificationIdentity = {
  categoryCode?: unknown
  categoryName?: unknown
  legacyCategory?: unknown
  productClassCode?: unknown
  externalProductClassCode?: unknown
  productTypeCode?: unknown
  externalProductTypeCode?: unknown
}

const FUEL_PRODUCT_TYPE_CODES = new Set([
  'AGO',
  'CNG',
  'DIESEL',
  'FUEL',
  'GASOLINE',
  'JETFUEL',
  'KEROSENE',
  'LPG',
  'PETROL',
  'PMS',
])

const normalizeCategoryValue = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

const normalizeProductTypeCode = (value: unknown) =>
  normalizeCategoryValue(value).replace(/[\s_-]+/g, '')

export function isFuelProduct(
  identity: ProductStockClassificationIdentity,
): boolean {
  const categoryCode = normalizeCategoryValue(identity.categoryCode)
  const categoryName = normalizeCategoryValue(identity.categoryName)
  if (categoryCode === 'FUEL' || categoryName === 'FUEL') return true

  const productClassCodes = [
    identity.productClassCode,
    identity.externalProductClassCode,
  ].map(normalizeCategoryValue)
  if (productClassCodes.includes('FUEL')) return true

  const productTypeCodes = [
    identity.productTypeCode,
    identity.externalProductTypeCode,
  ].map(normalizeProductTypeCode)
  if (productTypeCodes.some((code) => FUEL_PRODUCT_TYPE_CODES.has(code))) {
    return true
  }

  if (categoryCode || categoryName) return false
  return normalizeCategoryValue(identity.legacyCategory) === 'FUEL'
}

// Compatibility export. New stock policy code should use isFuelProduct.
export const isFuelCategory = isFuelProduct

export function isStockInReason(value: unknown): value is StockInReason {
  return STOCK_IN_REASONS.includes(value as StockInReason)
}

export function isStockOutReason(value: unknown): value is StockOutReason {
  return STOCK_OUT_REASONS.includes(value as StockOutReason)
}

export function assertStockReasonMatchesMovement(
  movementType: StockMovementType,
  reason: unknown,
): asserts reason is StockMovementReason {
  const valid =
    movementType === 'STOCK_IN'
      ? isStockInReason(reason)
      : isStockOutReason(reason)

  if (!valid) {
    throw new Error(
      movementType === 'STOCK_IN'
        ? 'Invalid stock-in reason.'
        : 'Invalid stock-out reason.',
    )
  }
}
