import type {
  MovementForm,
  ProxyStatus,
  StockMovementType,
  StockProduct,
} from '@/components/stock/stock.types'

export const STOCK_IN_REASONS = [
  { value: 'Delivery', label: 'Delivery' },
  { value: 'Transfer In', label: 'Transfer in' },
  { value: 'Production', label: 'Production' },
  { value: 'Stock Count', label: 'Stock count increase' },
] as const

export const STOCK_OUT_REASONS = [
  { value: 'Expired', label: 'Expired' },
  { value: 'Damaged', label: 'Damaged' },
  { value: 'Personal Use', label: 'Personal use' },
  { value: 'Raw Material', label: 'Raw material' },
  { value: 'Other', label: 'Other' },
  { value: 'Transfer Out', label: 'Transfer out' },
  { value: 'Waste', label: 'Waste' },
  { value: 'Return', label: 'Supplier return' },
  { value: 'Production', label: 'Production' },
  { value: 'Stock Count', label: 'Stock count decrease' },
] as const

const padDateTimePart = (value: number) => String(value).padStart(2, '0')

export const localDateTimeInputValue = (date: Date = new Date()) =>
  [
    date.getFullYear(),
    '-',
    padDateTimePart(date.getMonth() + 1),
    '-',
    padDateTimePart(date.getDate()),
    'T',
    padDateTimePart(date.getHours()),
    ':',
    padDateTimePart(date.getMinutes()),
  ].join('')

export const localDateTimeToIso = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const isFutureLocalDateTime = (
  value: string,
  now: Date = new Date(),
  toleranceMs = 5 * 60 * 1000,
) => {
  const date = new Date(value)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getTime() > now.getTime() + toleranceMs
  )
}

export const emptyStockMovementForm = (
  movementType: StockMovementType = 'STOCK_IN',
  product?: StockProduct,
): MovementForm => ({
  movementType,
  productRecordId: product?.id ?? '',
  reason: movementType === 'STOCK_IN' ? 'Delivery' : 'Damaged',
  quantity: '',
  unitCost: product ? String(product.unitCost ?? 0) : '',
  effectiveAtLocal: localDateTimeInputValue(),
  documentReference: '',
  remarks: '',
  supplierName: '',
  supplierPin: '',
  supplierInvoiceNumber: '',
})

export const formatStockQuantity = (value: number, unit: string) =>
  `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} ${unit}`

export const formatStockDateTime = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export const proxyBadgeVariant = (status: ProxyStatus | null) => {
  if (status === 'SENT') return 'success' as const
  if (status === 'FAILED') return 'error' as const
  if (status === 'PENDING') return 'warn' as const
  return 'neutral' as const
}

export const formatProxyStatus = (status: ProxyStatus | null) => {
  if (status === 'NOT_REQUIRED') return 'Local only'
  if (!status) return 'No movements'
  return status
}
