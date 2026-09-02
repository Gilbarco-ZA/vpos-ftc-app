import type { StockMovementType } from '@/src/modules/stock/domain/stockMovement'

export type TransactionStockQuantity = {
  productRecordId: string
  quantity: number
}

export type TransactionStockDelta = {
  productRecordId: string
  movementType: StockMovementType
  quantity: number
}

const PRECISION = 6
const EPSILON = 10 ** -PRECISION

const normalizeQuantity = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(PRECISION))
}

const aggregateQuantities = (entries: TransactionStockQuantity[]) => {
  const totals = new Map<string, number>()

  for (const entry of entries) {
    const productRecordId = String(entry.productRecordId || '').trim()
    const quantity = normalizeQuantity(Number(entry.quantity))
    if (!productRecordId || quantity <= 0) continue
    totals.set(
      productRecordId,
      normalizeQuantity((totals.get(productRecordId) ?? 0) + quantity),
    )
  }

  return totals
}

export function buildTransactionStockDeltas(input: {
  target: TransactionStockQuantity[]
  applied: TransactionStockQuantity[]
}): TransactionStockDelta[] {
  const target = aggregateQuantities(input.target)
  const applied = aggregateQuantities(input.applied)
  const productIds = Array.from(
    new Set([...target.keys(), ...applied.keys()]),
  ).sort()

  const deltas: TransactionStockDelta[] = []

  for (const productRecordId of productIds) {
    const difference = normalizeQuantity(
      (target.get(productRecordId) ?? 0) - (applied.get(productRecordId) ?? 0),
    )

    if (Math.abs(difference) < EPSILON) continue

    deltas.push({
      productRecordId,
      movementType: difference > 0 ? 'STOCK_OUT' : 'STOCK_IN',
      quantity: normalizeQuantity(Math.abs(difference)),
    })
  }

  return deltas
}
