import type { Product, ProductSyncStatus } from '@/src/shared/types'

import { mapRows } from '@/src/platform/db/postgres'

export type ProductListItemRecord = {
  id: string
  productId: string
  productCode: string
  productName: string
  sku?: string
  unitPrice: number
  currency: string
  lastSyncStatus?: ProductSyncStatus
  lastSyncAt: string | null
}

export type ProductRecord = Product & {
  extProductId?: string
  extProductCode?: string
  extProductClassCode?: string
  extProductTypeCode?: string
  extDescription?: string
  extUnitOfMeasure?: string
  extUnitOfPackaging?: string
  extUnitPrice?: number
  extCurrency?: string
  extTaxCode?: string
  extHazardousIndicator?: boolean
  createdByName?: string
  isOnline?: boolean
}

export function mapProductListItemRow(
  row: Record<string, unknown>,
): ProductListItemRecord {
  return {
    id: String(row.product_id ?? row.id ?? ''),
    productId: String(row.product_id ?? ''),
    productCode: String(row.product_code ?? ''),
    productName: String(row.product_name ?? ''),
    sku: row.sku == null ? undefined : String(row.sku),
    unitPrice: Number(row.unit_price ?? 0),
    currency: String(row.currency ?? ''),
    lastSyncStatus: row.last_sync_status
      ? (String(row.last_sync_status) as ProductSyncStatus)
      : undefined,
    lastSyncAt: row.last_sync_at
      ? new Date(String(row.last_sync_at)).toISOString()
      : null,
  }
}

export function mapProductRow(row: Record<string, unknown>): ProductRecord {
  const mapped = mapRows<ProductRecord>([row])[0]
  return {
    ...mapped,
    unitPrice: Number((mapped as any).unitPrice),
    unitCost: Number((mapped as any).unitCost),
    taxRate: Number((mapped as any).taxRate),
    extUnitPrice:
      (mapped as any).extUnitPrice == null
        ? undefined
        : Number((mapped as any).extUnitPrice),
  }
}
