export type TransactionEditabilityInput = {
  pumpNumber?: number | string | null
  pump_number?: number | string | null
  fuelType?: string | null
  fuel_type?: string | null
  domsSourceSystem?: string | null
  doms_source_system?: string | null
  domsPayloadJson?: unknown
  doms_payload_json?: unknown
}

const cleanText = (value: unknown) => String(value ?? '').trim()

const EDITABLE_TRANSACTION_ITEM_STATUSES = new Set([
  'OPEN',
  'ALLOCATED',
  'FAILED',
  'PENDING',
])

export const isTransactionItemStatusEditable = (status: unknown): boolean =>
  EDITABLE_TRANSACTION_ITEM_STATUSES.has(
    String(status ?? '')
      .trim()
      .toUpperCase(),
  )

const finiteNumber = (value: unknown) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const isPumpRecordedFuelTransaction = (
  transaction: TransactionEditabilityInput | null | undefined,
): boolean => {
  if (!transaction) return false

  const pumpNumber = finiteNumber(
    transaction.pumpNumber ?? transaction.pump_number,
  )
  const fuelType = cleanText(transaction.fuelType ?? transaction.fuel_type)
  const sourceSystem = cleanText(
    transaction.domsSourceSystem ?? transaction.doms_source_system,
  )
  const hasDomsPayload = Boolean(
    transaction.domsPayloadJson ?? transaction.doms_payload_json,
  )

  return (
    sourceSystem.length > 0 ||
    hasDomsPayload ||
    (pumpNumber != null && pumpNumber > 0 && fuelType.length > 0)
  )
}

export const getTransactionItemEditability = (
  transaction: TransactionEditabilityInput | null | undefined,
) => {
  if (isPumpRecordedFuelTransaction(transaction)) {
    return {
      editable: true,
      fuelItemsLocked: true,
      reason:
        'Fuel items recorded by a forecourt pump are read-only. Non-fuel products may still be added, changed, or removed.',
      code: 'PUMP_RECORDED_FUEL_ITEMS_LOCKED',
    } as const
  }

  return {
    editable: true,
    fuelItemsLocked: false,
    reason: null,
    code: null,
  } as const
}
