import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { ProductStatus } from './products.types'

export { formatDate } from '@/src/shared/utils/dates'

export const formatPrice = (price: number) => {
  if (Number.isNaN(price)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export const statusVariant = (status: ProductStatus) => {
  if (status === 'SYNCED') return STATUS_VARIANT.SUCCESS
  if (status === 'FAILED') return STATUS_VARIANT.ERROR
  if (status === 'PENDING') return STATUS_VARIANT.WARN
  return STATUS_VARIANT.INFO
}

export const statusLabel = (status: ProductStatus) => {
  if (status === 'SYNCED') return 'Synced'
  if (status === 'FAILED') return 'Failed'
  if (status === 'PENDING') return 'Pending'
  return 'Unknown'
}

export const normalizeStatus = (value: string): ProductStatus => {
  const upper = value.toUpperCase()
  if (upper === 'SYNCED') return 'SYNCED'
  if (upper === 'FAILED') return 'FAILED'
  if (upper === 'PENDING') return 'PENDING'
  return 'UNKNOWN'
}

export const statusOptions: Array<{
  label: string
  value: ProductStatus | 'ALL'
}> = [
  { label: 'All', value: 'ALL' },
  { label: 'Synced', value: 'SYNCED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Unknown', value: 'UNKNOWN' },
]
