import type {
  ConfigOption,
  ProductListItem,
} from '@/components/products/products.types'
import type { ProductListItemRecord } from '@/src/modules/products/infrastructure/persistence/product.repository'

import { getConfiguredCurrencyOptions } from '@/src/platform/config/products'
import { KE_DATASET } from '@/src/shared/config/datasets/KE'
import { TZ_DATASET } from '@/src/shared/config/datasets/TZ'

export const getCurrencyOptions = (country?: string | null) => {
  const configuredOptions = getConfiguredCurrencyOptions()

  if (configuredOptions.length > 0) return configuredOptions

  if (country === 'TZ') return ['TZS']
  if (country === 'KE') return ['KES']
  return ['KES']
}

export const getDefaultCurrency = (country?: string | null) => {
  const options = getCurrencyOptions(country)
  return options[0] ?? 'KES'
}

export const getTaxTypeOptions = (country?: string | null): ConfigOption[] => {
  const normalized = String(country || '')
    .trim()
    .toUpperCase()
  const rows = normalized === 'TZ' ? TZ_DATASET.taxTypes : KE_DATASET.taxTypes

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    rate: row.rate ?? null,
  }))
}

export const normalizeProductsForDisplay = (
  items: ProductListItemRecord[],
): ProductListItem[] => {
  return items.map((item) => ({
    id: String(item.productId ?? item.id),
    name: String(item.productName ?? 'Unnamed product'),
    code: String(item.productCode ?? 'N/A'),
    sku: item.sku ?? undefined,
    unitPrice: Number(item.unitPrice ?? 0),
    currency: String(item.currency ?? 'KES'),
    lastSyncStatus: (String(item.lastSyncStatus ?? 'UNKNOWN').toUpperCase() ||
      'UNKNOWN') as ProductListItem['lastSyncStatus'],
    lastSynced: item.lastSyncAt ? String(item.lastSyncAt) : null,
  }))
}
