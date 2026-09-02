import type {
  ProductListItemRecord,
  ProductRecord,
} from '@/src/modules/products/infrastructure/persistence/product.mapper'
import type { PoolClient } from 'pg'

import { txQuery } from '@/src/platform/db/postgres'
import { queryAll, queryOne } from '@/src/platform/db/postgres/query'

import {
  mapProductListItemRow,
  mapProductRow,
} from '@/src/modules/products/infrastructure/persistence/product.mapper'
import {
  GET_PRODUCT_BY_ID_SQL,
  LIST_PRODUCTS_SQL,
  UPDATE_PRODUCT_SYNC_STATUS_SQL,
  UPSERT_PRODUCT_SQL,
} from '@/src/modules/products/infrastructure/persistence/product.sql'

export type {
  ProductListItemRecord,
  ProductRecord,
} from '@/src/modules/products/infrastructure/persistence/product.mapper'

export type UpsertProductRecordParams = {
  id: string
  stationId: string
  productId: string
  productCode: string
  productName: string
  productClassCode: string
  productTypeCode: string
  sku?: string | null
  barcode?: string | null
  unitPrice: number
  unitCost: number
  currency: string
  taxRate: number
  categoryId?: string | null
  category?: string | null
  unitOfMeasure?: string | null
  unitOfPackaging?: string | null
  extProductId?: string | null
  extProductCode?: string | null
  extProductClassCode?: string | null
  extProductTypeCode?: string | null
  extDescription?: string | null
  extUnitOfMeasure?: string | null
  extUnitOfPackaging?: string | null
  extUnitPrice?: number | null
  extCurrency?: string | null
  extTaxCode?: string | null
  extHazardousIndicator?: boolean | null
  packSize?: number | null
  taxCode?: string | null
  commodityCode?: string | null
  hazardousIndicator?: boolean | null
  createdByName: string
  isOnline: boolean
  devFlowOverride?: string | null
  lastSyncStatus?: string | null
  lastSyncAt?: string | null
  lastSyncMessage?: string | null
}

export async function listProductsRepo(
  stationId: string,
): Promise<ProductListItemRecord[]> {
  const rows = await queryAll<Record<string, unknown>>(LIST_PRODUCTS_SQL, [
    stationId,
  ])
  return rows.map(mapProductListItemRow)
}

export async function getProductByIdRepo(
  stationId: string,
  productId: string,
): Promise<ProductRecord | null> {
  const row = await queryOne<Record<string, unknown>>(GET_PRODUCT_BY_ID_SQL, [
    stationId,
    productId,
  ])
  return row ? mapProductRow(row) : null
}

const buildUpsertProductParams = (args: UpsertProductRecordParams) => [
  args.id,
  args.stationId,
  args.productId,
  args.productCode,
  args.productName,
  args.productClassCode,
  args.productTypeCode,
  args.sku ?? null,
  args.barcode ?? null,
  args.unitPrice,
  args.unitCost,
  args.currency,
  args.taxRate,
  args.categoryId ?? null,
  args.category ?? null,
  args.unitOfMeasure ?? null,
  args.unitOfPackaging ?? null,
  args.extProductId ?? args.productId,
  args.extProductCode ?? args.productCode,
  args.extProductClassCode ?? args.productClassCode ?? null,
  args.extProductTypeCode ?? args.productTypeCode ?? null,
  args.extDescription ?? args.productName,
  args.extUnitOfMeasure ?? args.unitOfMeasure ?? null,
  args.extUnitOfPackaging ?? args.unitOfPackaging ?? null,
  args.extUnitPrice ?? args.unitPrice,
  args.extCurrency ?? args.currency,
  args.extTaxCode ?? args.taxCode ?? null,
  args.extHazardousIndicator ?? args.hazardousIndicator ?? true,
  args.packSize ?? null,
  args.taxCode ?? null,
  args.commodityCode ?? null,
  args.hazardousIndicator ?? false,
  args.createdByName,
  args.isOnline,
  args.devFlowOverride ?? null,
  args.lastSyncStatus ?? 'PENDING',
  args.lastSyncAt ?? null,
  args.lastSyncMessage ?? null,
]

export async function upsertProductRepo(
  args: UpsertProductRecordParams,
): Promise<ProductRecord | null> {
  const row = await queryOne<Record<string, unknown>>(
    UPSERT_PRODUCT_SQL,
    buildUpsertProductParams(args),
  )

  return row ? mapProductRow(row) : null
}

export async function upsertProductWithClientRepo(
  client: PoolClient,
  args: UpsertProductRecordParams,
): Promise<ProductRecord | null> {
  const result = await txQuery<Record<string, unknown>>(
    client,
    UPSERT_PRODUCT_SQL,
    buildUpsertProductParams(args),
  )
  const row = result.rows[0]
  return row ? mapProductRow(row) : null
}

export async function updateProductSyncStatusRepo(args: {
  stationId: string
  productId: string
  status: string
  message?: string | null
}): Promise<void> {
  await queryOne(UPDATE_PRODUCT_SYNC_STATUS_SQL, [
    args.stationId,
    args.productId,
    args.status,
    args.message ?? null,
  ])
}
