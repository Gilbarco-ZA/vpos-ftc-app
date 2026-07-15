import type { ProductRecord } from '@/src/modules/products/infrastructure/persistence/product.repository'
import type { ProductCreateInput } from '@/src/modules/products/infrastructure/validators/product.schemas'
import type {
  ProductDevFlowOverride,
  ProductSyncStatus,
} from '@/src/shared/types'

import { isProductDevOverridesEnabled } from '@/src/platform/config/products'
import {
  checkProxyDeviceStatus,
  uploadProductsViaProxy,
} from '@/src/shared/proxy/client'
import {
  isSupportedCountryCode,
  listCountryDatasetRows,
} from '@/src/shared/server/config/countryDatasets'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { resolveProductCategoriesByIdsRepo } from '@/src/modules/products/infrastructure/persistence/product-category.repository'
import {
  updateProductSyncStatusRepo,
  upsertProductRepo,
} from '@/src/modules/products/infrastructure/persistence/product.repository'
import { productCreateSchema } from '@/src/modules/products/infrastructure/validators/product.schemas'

const DEFAULT_TAX_RATE = 16

export type NormalizedProductInput = {
  productId: string
  productCode: string
  productName: string
  productClassCode: string
  productTypeCode: string
  sku?: string
  barcode?: string
  unitPrice: number
  unitCost: number
  currency: string
  taxRate: number
  categoryId?: string
  category?: string
  unitOfMeasure?: string
  unitOfPackaging?: string
  packSize?: number
  taxCode?: string
  commodityCode?: string
  hazardousIndicator?: boolean
  devFlowOverride?: ProductDevFlowOverride | null
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
}

export type ProductCloudSyncInput = NormalizedProductInput & {
  createdByName: string
  isOnline: boolean
}

const resolveCreatedBy = (user: { fullName?: string; username: string }) => {
  return (user.fullName || user.username || 'Unknown User').trim()
}

const checkInternetReachable = async () => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const res = await fetch('https://www.google.com/generate_204', {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

export async function resolveProductOnlineStatus(
  stationId?: string,
): Promise<boolean> {
  const [proxyStatus, internetReachable] = await Promise.all([
    checkProxyDeviceStatus(stationId),
    checkInternetReachable(),
  ])
  return Boolean(proxyStatus.proxyReachable && internetReachable)
}

export function normalizeProductInput(
  input: ProductCreateInput,
): NormalizedProductInput {
  const parsed = productCreateSchema.parse(input)
  const productCode = parsed.productCode.trim()
  const productId = (parsed.productId || parsed.productCode).trim()

  if (!productId) {
    throw new Error('Product ID is required')
  }

  return {
    ...parsed,
    productId,
    productCode,
    productName: parsed.productName.trim(),
    productClassCode: parsed.productClassCode.trim(),
    productTypeCode: parsed.productTypeCode.trim(),
    sku: parsed.sku?.trim() || undefined,
    barcode: parsed.barcode?.trim() || undefined,
    unitPrice: Number(parsed.unitPrice),
    unitCost: Number(parsed.unitCost),
    currency: parsed.currency.trim(),
    categoryId: parsed.categoryId?.trim() || undefined,
    category: parsed.category?.trim() || undefined,
    unitOfMeasure: parsed.unitOfMeasure?.trim() || undefined,
    unitOfPackaging: parsed.unitOfPackaging?.trim() || undefined,
    packSize: parsed.packSize,
    taxCode: parsed.taxCode?.trim() || undefined,
    commodityCode: parsed.commodityCode?.trim() || undefined,
    devFlowOverride: parsed.devFlowOverride ?? null,
    taxRate: parsed.taxRate ?? DEFAULT_TAX_RATE,
    hazardousIndicator: parsed.hazardousIndicator ?? false,
    extProductId: parsed.extProductId?.trim() || productId,
    extProductCode: parsed.extProductCode?.trim() || productCode,
    extProductClassCode:
      parsed.extProductClassCode?.trim() || parsed.productClassCode.trim(),
    extProductTypeCode:
      parsed.extProductTypeCode?.trim() || parsed.productTypeCode.trim(),
    extDescription: parsed.extDescription?.trim() || parsed.productName.trim(),
    extUnitOfMeasure:
      parsed.extUnitOfMeasure?.trim() ||
      parsed.unitOfMeasure?.trim() ||
      undefined,
    extUnitOfPackaging:
      parsed.extUnitOfPackaging?.trim() ||
      parsed.unitOfPackaging?.trim() ||
      undefined,
    extUnitPrice: parsed.extUnitPrice ?? Number(parsed.unitPrice),
    extCurrency: parsed.extCurrency?.trim() || parsed.currency.trim(),
    extTaxCode:
      parsed.extTaxCode?.trim() || parsed.taxCode?.trim() || undefined,
    extHazardousIndicator:
      parsed.extHazardousIndicator ?? parsed.hazardousIndicator ?? true,
  }
}

const resolveDevFlowOverride = (
  value: ProductDevFlowOverride | null | undefined,
) => {
  if (!isProductDevOverridesEnabled()) return null
  return value ?? null
}

export async function createProductsService(params: {
  stationId: string
  user: { fullName?: string; username: string }
  inputs: ProductCreateInput[]
}) {
  const onlineStatus = false
  const createdBy = resolveCreatedBy(params.user)
  const normalized = params.inputs.map(normalizeProductInput)
  const categoryLookup = await resolveProductCategoriesByIdsRepo(
    params.stationId,
    normalized.map((item) => item.categoryId || ''),
  )

  const products = await Promise.all(
    normalized.map(async (item) => {
      const resolvedCategory = item.categoryId
        ? (categoryLookup.get(item.categoryId) ?? null)
        : null
      if (item.categoryId && !resolvedCategory) {
        throw new Error('Selected product category is invalid')
      }

      const categoryName = resolvedCategory?.name ?? item.category ?? null

      return await upsertProductRepo({
        id: uuidv4(),
        stationId: params.stationId,
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        productClassCode: item.productClassCode,
        productTypeCode: item.productTypeCode,
        sku: item.sku ?? null,
        barcode: item.barcode ?? null,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        currency: item.currency,
        taxRate: item.taxRate ?? DEFAULT_TAX_RATE,
        categoryId: item.categoryId ?? null,
        category: categoryName,
        unitOfMeasure: item.unitOfMeasure ?? null,
        unitOfPackaging: item.unitOfPackaging ?? null,
        extProductId: item.extProductId ?? item.productId,
        extProductCode: item.extProductCode ?? item.productCode,
        extProductClassCode: item.extProductClassCode ?? item.productClassCode,
        extProductTypeCode: item.extProductTypeCode ?? item.productTypeCode,
        extDescription: item.extDescription ?? item.productName,
        extUnitOfMeasure: item.extUnitOfMeasure ?? item.unitOfMeasure ?? null,
        extUnitOfPackaging:
          item.extUnitOfPackaging ?? item.unitOfPackaging ?? null,
        extUnitPrice: item.extUnitPrice ?? item.unitPrice,
        extCurrency: item.extCurrency ?? item.currency,
        extTaxCode: item.extTaxCode ?? item.taxCode ?? null,
        extHazardousIndicator:
          item.extHazardousIndicator ?? item.hazardousIndicator ?? true,
        packSize: item.packSize ?? null,
        taxCode: item.taxCode ?? null,
        commodityCode: item.commodityCode ?? null,
        hazardousIndicator: item.hazardousIndicator ?? false,
        createdByName: createdBy,
        isOnline: onlineStatus,
        devFlowOverride: resolveDevFlowOverride(item.devFlowOverride),
        lastSyncStatus: 'PENDING',
        lastSyncAt: null,
        lastSyncMessage: null,
      })
    }),
  )

  return {
    createdBy,
    onlineStatus,
    products: products.filter(Boolean) as ProductRecord[],
    normalized,
  }
}

export async function createProductService(args: {
  stationId: string
  user: { fullName?: string; username: string }
  input: ProductCreateInput
}) {
  const result = await createProductsService({
    stationId: args.stationId,
    user: args.user,
    inputs: [args.input],
  })

  return {
    createdBy: result.createdBy,
    onlineStatus: result.onlineStatus,
    product: result.products[0] ?? null,
    normalized: result.normalized[0] ?? null,
  }
}

export async function updateProductService(args: {
  stationId: string
  user: { fullName?: string; username: string }
  input: ProductCreateInput
}) {
  return await createProductService(args)
}

export async function updateProductStatusService(args: {
  stationId: string
  productId: string
  status: ProductSyncStatus
  message?: string | null
}) {
  await updateProductSyncStatusRepo(args)
}

export function buildProductCloudSyncInput(
  product: ProductRecord,
  params: { createdByName: string; isOnline: boolean },
): ProductCloudSyncInput {
  return {
    productId: product.extProductId ?? product.productId,
    productCode: product.extProductCode ?? product.productCode,
    productName: product.extDescription ?? product.productName,
    productClassCode: product.extProductClassCode ?? product.productClassCode,
    productTypeCode: product.extProductTypeCode ?? product.productTypeCode,
    sku: product.sku,
    barcode: product.barcode,
    unitPrice: product.extUnitPrice ?? product.unitPrice,
    unitCost: product.unitCost,
    currency: product.extCurrency ?? product.currency,
    taxRate: product.taxRate,
    category: product.category,
    unitOfMeasure: product.extUnitOfMeasure ?? product.unitOfMeasure,
    unitOfPackaging: product.extUnitOfPackaging ?? product.unitOfPackaging,
    packSize:
      product.packSize === null || product.packSize === undefined
        ? undefined
        : Number(product.packSize),
    taxCode: product.extTaxCode ?? product.taxCode,
    commodityCode: product.commodityCode,
    hazardousIndicator:
      product.extHazardousIndicator ?? product.hazardousIndicator ?? false,
    extProductId: product.extProductId,
    extProductCode: product.extProductCode,
    extProductClassCode: product.extProductClassCode,
    extProductTypeCode: product.extProductTypeCode,
    extDescription: product.extDescription,
    extUnitOfMeasure: product.extUnitOfMeasure,
    extUnitOfPackaging: product.extUnitOfPackaging,
    extUnitPrice: product.extUnitPrice,
    extCurrency: product.extCurrency,
    extTaxCode: product.extTaxCode,
    extHazardousIndicator: product.extHazardousIndicator,
    createdByName: params.createdByName,
    devFlowOverride: product.devFlowOverride ?? undefined,
    isOnline: params.isOnline,
  }
}

export async function syncProductsToCloudService(params: {
  stationId: string
  products: ProductCloudSyncInput[]
}) {
  return await uploadProductsViaProxy(params.stationId, {
    products: params.products.map((product) => ({
      IsOnline: product.isOnline,
      productId: product.extProductId ?? product.productId,
      productCode: product.extProductCode ?? product.productCode,
      productName: product.extDescription ?? product.productName,
      productClassCode: product.extProductClassCode ?? product.productClassCode,
      productTypeCode: product.extProductTypeCode ?? product.productTypeCode,
      sku: product.sku,
      barcode: product.barcode,
      unitPrice: product.extUnitPrice ?? product.unitPrice,
      unitCost: product.unitCost,
      currency: product.extCurrency ?? product.currency,
      taxRate: product.taxRate,
      category: product.category,
      unitOfMeasure: product.extUnitOfMeasure ?? product.unitOfMeasure,
      unitOfPackaging: product.extUnitOfPackaging ?? product.unitOfPackaging,
      packSize: product.packSize,
      taxCode: product.extTaxCode ?? product.taxCode,
      commodityCode: product.commodityCode,
      hazardousIndicator: product.hazardousIndicator ?? false,
      createdByName: product.createdByName,
      devFlowOverride: product.devFlowOverride ?? undefined,
    })),
  })
}

export async function listProductClassCodesService(args: {
  country?: string | null
}) {
  const country = String(args.country || '').toUpperCase()
  if (!(await isSupportedCountryCode(country))) return []

  return await listCountryDatasetRows({
    countryCode: country,
    datasetType: 'productClassCodes',
    activeOnly: true,
  })
}
