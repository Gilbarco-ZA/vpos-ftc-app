import type {
  ConfigOption,
  ProductListItem,
} from '@/components/products/products.types'
import type { ProductListItemRecord } from '@/src/modules/products/infrastructure/persistence/product.repository'

import { getConfiguredCurrencyOptions } from '@/src/platform/config/products'
import {
  getCountryDatasetSummary,
  isSupportedCountryCode,
  listCountryDatasetRows,
} from '@/src/shared/server/config/countryDatasets'

import { resolveDefaultProductCurrency } from './product-currency-policy'

export const getDefaultCurrency = async (country?: string | null) => {
  const summary = country ? await getCountryDatasetSummary(country) : null
  return resolveDefaultProductCurrency({
    stationCurrency: summary?.currencyCode,
    configuredOptions: getConfiguredCurrencyOptions(),
    environmentDefault: process.env.DEFAULT_CURRENCY,
  })
}

export const getTaxTypeOptions = async (
  country?: string | null,
): Promise<ConfigOption[]> => {
  const normalized = String(country || '')
    .trim()
    .toUpperCase()
  if (!(await isSupportedCountryCode(normalized))) return []

  const rows = await listCountryDatasetRows({
    countryCode: normalized,
    datasetType: 'taxTypes',
    activeOnly: true,
  })

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
    currency: String(
      item.currency ?? process.env.DEFAULT_CURRENCY?.trim() ?? 'USD',
    ),
    lastSyncStatus: (String(item.lastSyncStatus ?? 'UNKNOWN').toUpperCase() ||
      'UNKNOWN') as ProductListItem['lastSyncStatus'],
    lastSynced: item.lastSyncAt ? String(item.lastSyncAt) : null,
  }))
}
