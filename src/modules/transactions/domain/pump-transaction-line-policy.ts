export type PumpTransactionLineSnapshot = {
  productId: string
  quantity: number
  unitPrice: number
  isFuel: boolean
}

export type PumpTransactionLineViolation =
  | {
      code: 'PUMP_RECORDED_FUEL_ADDITION_BLOCKED'
      productId: string
    }
  | {
      code: 'PUMP_RECORDED_FUEL_ITEM_IMMUTABLE'
      productId: string
    }

const sameNumber = (left: unknown, right: unknown) => {
  const a = Number(left)
  const b = Number(right)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.000001
}

export function findPumpTransactionLineViolation(input: {
  existingFuelLines: PumpTransactionLineSnapshot[]
  requestedLines: PumpTransactionLineSnapshot[]
  removedProductIds?: string[]
}): PumpTransactionLineViolation | null {
  const lockedFuelByProductId = new Map(
    input.existingFuelLines
      .filter((line) => line.isFuel)
      .map((line) => [String(line.productId), line] as const),
  )
  const removedProductIds = new Set(
    (input.removedProductIds ?? [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )

  for (const requestedLine of input.requestedLines) {
    const productId = String(requestedLine.productId ?? '').trim()
    if (
      requestedLine.isFuel &&
      productId &&
      !lockedFuelByProductId.has(productId)
    ) {
      return {
        code: 'PUMP_RECORDED_FUEL_ADDITION_BLOCKED',
        productId,
      }
    }
  }

  for (const [productId, lockedLine] of lockedFuelByProductId) {
    const submitted = input.requestedLines.find(
      (line) => String(line.productId) === productId,
    )
    if (
      !submitted ||
      removedProductIds.has(productId) ||
      !sameNumber(submitted.quantity, lockedLine.quantity) ||
      !sameNumber(submitted.unitPrice, lockedLine.unitPrice)
    ) {
      return {
        code: 'PUMP_RECORDED_FUEL_ITEM_IMMUTABLE',
        productId,
      }
    }
  }

  return null
}
