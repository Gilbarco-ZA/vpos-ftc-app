import type { ProductRecord } from '@/src/modules/products/infrastructure/persistence/product.repository'
import type { ImportedStockAdjustment } from '@/src/modules/stock/infrastructure/stock.repository'
import type { SessionUser } from '@/src/shared/types'

import { withTransaction } from '@/src/platform/db/postgres'
import { AppError } from '@/src/shared/errors/AppError'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { updateProductStatus } from '@/src/modules/products/application/commands/update-product-status'
import {
  parseProductImportCsv,
  validateProductImportCategories,
} from '@/src/modules/products/application/productCsvImport'
import {
  buildProductCloudSyncInput,
  normalizeProductInput,
  resolveProductOnlineStatus,
  syncProductsToCloudService,
} from '@/src/modules/products/application/services/product-service'
import { resolveProductCategoriesByReferencesRepo } from '@/src/modules/products/infrastructure/persistence/product-category.repository'
import { upsertProductWithClientRepo } from '@/src/modules/products/infrastructure/persistence/product.repository'
import { syncStockMovementsIndependently } from '@/src/modules/stock/application/syncStockMovements'
import { applyImportedStockRepo } from '@/src/modules/stock/infrastructure/stock.repository'

export type ImportedProductRowResult = {
  rowNumber: number
  productId: string
  productName: string
  stock: ImportedStockAdjustment | null
}

const actorName = (user: SessionUser) =>
  user.fullName || user.name || user.username || user.email || 'Unknown User'

export async function importProductsCsv(args: {
  stationId: string
  user: SessionUser
  csvText: string
  fileName: string
}) {
  const parsed = parseProductImportCsv(args.csvText)
  if (parsed.errors.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Product CSV validation failed.',
      400,
      { errors: parsed.errors },
    )
  }

  const categoryResolution = await resolveProductCategoriesByReferencesRepo(
    args.stationId,
    parsed.rows.map((row) => row.categoryReference),
  )
  const categoryErrors = validateProductImportCategories(
    parsed.rows,
    categoryResolution.categories,
    categoryResolution.ambiguousReferences,
  )
  if (categoryErrors.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Product CSV category validation failed.',
      400,
      { errors: categoryErrors },
    )
  }

  const createdByName = actorName(args.user)
  const importedAt = new Date().toISOString()
  const batchReference = `CSV-${importedAt.slice(0, 10).replaceAll('-', '')}-${uuidv4().slice(0, 8).toUpperCase()}`

  const transactionResult = await withTransaction(async (client) => {
    const products: ProductRecord[] = []
    const rows: ImportedProductRowResult[] = []
    const movementIds: string[] = []

    for (const row of parsed.rows) {
      const category = categoryResolution.categories.get(
        row.categoryReference.trim().toUpperCase(),
      )
      if (!category) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Category ${row.categoryReference} was not found.`,
          400,
        )
      }

      const normalized = normalizeProductInput({
        ...row.product,
        categoryId: category.id,
        category: category.name,
      })
      const product = await upsertProductWithClientRepo(client, {
        id: uuidv4(),
        stationId: args.stationId,
        productId: normalized.productId,
        productCode: normalized.productCode,
        productName: normalized.productName,
        productClassCode: normalized.productClassCode,
        productTypeCode: normalized.productTypeCode,
        sku: normalized.sku ?? null,
        barcode: normalized.barcode ?? null,
        unitPrice: normalized.unitPrice,
        unitCost: normalized.unitCost,
        currency: normalized.currency,
        taxRate: normalized.taxRate,
        categoryId: category.id,
        category: category.name,
        unitOfMeasure: normalized.unitOfMeasure ?? null,
        unitOfPackaging: normalized.unitOfPackaging ?? null,
        extProductId: normalized.extProductId ?? normalized.productId,
        extProductCode: normalized.extProductCode ?? normalized.productCode,
        extProductClassCode:
          normalized.extProductClassCode ?? normalized.productClassCode,
        extProductTypeCode:
          normalized.extProductTypeCode ?? normalized.productTypeCode,
        extDescription: normalized.extDescription ?? normalized.productName,
        extUnitOfMeasure:
          normalized.extUnitOfMeasure ?? normalized.unitOfMeasure ?? null,
        extUnitOfPackaging:
          normalized.extUnitOfPackaging ?? normalized.unitOfPackaging ?? null,
        extUnitPrice: normalized.extUnitPrice ?? normalized.unitPrice,
        extCurrency: normalized.extCurrency ?? normalized.currency,
        extTaxCode: normalized.extTaxCode ?? normalized.taxCode ?? null,
        extHazardousIndicator:
          normalized.extHazardousIndicator ??
          normalized.hazardousIndicator ??
          false,
        packSize: normalized.packSize ?? null,
        taxCode: normalized.taxCode ?? null,
        commodityCode: normalized.commodityCode ?? null,
        hazardousIndicator: normalized.hazardousIndicator ?? false,
        createdByName,
        isOnline: false,
        devFlowOverride: null,
        lastSyncStatus: 'PENDING',
        lastSyncAt: null,
        lastSyncMessage: `Imported from ${args.fileName}; sync pending`,
      })
      if (!product) {
        throw new AppError(
          'INTERNAL_ERROR',
          `Row ${row.rowNumber}: product could not be saved.`,
          500,
        )
      }
      products.push(product)

      let stock: ImportedStockAdjustment | null = null
      if (row.stockQuantity !== null && row.stockUpdateMode) {
        stock = await applyImportedStockRepo(client, {
          stationId: args.stationId,
          productRecordId: product.id,
          stockQuantity: row.stockQuantity,
          stockUpdateMode: row.stockUpdateMode,
          unitCost: normalized.unitCost,
          effectiveAt: importedAt,
          batchReference,
          actor: { userId: args.user.id, name: createdByName },
        })
        if (stock.movementId) movementIds.push(stock.movementId)
      }

      rows.push({
        rowNumber: row.rowNumber,
        productId: product.productId,
        productName: product.productName,
        stock,
      })
    }

    return { products, rows, movementIds }
  })

  let productSync: {
    ok: boolean
    status: 'synced' | 'pending' | 'failed'
    message: string
  }
  try {
    const online = await resolveProductOnlineStatus(args.stationId)
    const sync = await syncProductsToCloudService({
      stationId: args.stationId,
      products: transactionResult.products.map((product) =>
        buildProductCloudSyncInput(product, {
          createdByName,
          isOnline: online,
        }),
      ),
    })
    productSync = {
      ok: sync.ok,
      status: sync.ok ? (online ? 'synced' : 'pending') : 'failed',
      message: sync.ok
        ? online
          ? 'Imported products were synced to the cloud service.'
          : 'Imported products were accepted by vpos-proxy; cloud sync is pending.'
        : 'Products were saved locally; vpos-proxy product sync failed.',
    }
  } catch {
    productSync = {
      ok: false,
      status: 'failed',
      message: 'Products were saved locally; vpos-proxy product sync failed.',
    }
  }

  await Promise.all(
    transactionResult.products.map((product) =>
      updateProductStatus({
        stationId: args.stationId,
        productId: product.productId,
        status: productSync.status,
        message: productSync.status === 'synced' ? null : productSync.message,
      }),
    ),
  ).catch(() => undefined)

  const stockSync = productSync.ok
    ? await syncStockMovementsIndependently(
        args.stationId,
        transactionResult.movementIds,
      )
    : []
  const stockProxyPendingCount = productSync.ok
    ? 0
    : transactionResult.movementIds.length

  return {
    batchReference,
    importedProductCount: transactionResult.products.length,
    stockMovementCount: transactionResult.movementIds.length,
    stockProxyFailureCount: stockSync.filter((result) => !result.success)
      .length,
    stockProxyPendingCount,
    productSync,
    stockSync,
    rows: transactionResult.rows,
  }
}
