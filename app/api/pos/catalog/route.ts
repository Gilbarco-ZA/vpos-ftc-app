import type { PosCatalogResponse } from '@/src/modules/pos/contracts/catalog'

import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

import { listProductCategories } from '@/src/modules/products/application/queries/list-product-categories'
import { listTransactionCatalogProducts } from '@/src/modules/transactions/application/queries/list-transaction-catalog-products'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXCLUDED_CATEGORY_CODES = new Set(['FUEL'])
const EXCLUDED_CATEGORY_NAMES = new Set(['fuel'])

const isExcludedCategory = (category: {
  code?: string | null
  name?: string | null
}) =>
  EXCLUDED_CATEGORY_CODES.has(String(category.code || '').toUpperCase()) ||
  EXCLUDED_CATEGORY_NAMES.has(
    String(category.name || '')
      .trim()
      .toLowerCase(),
  )

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const [products, categories, decimals] = await Promise.all([
      listTransactionCatalogProducts(user.stationId),
      listProductCategories({ stationId: user.stationId }),
      getStationDecimalSettings(user.stationId),
    ])

    const visibleCategories = categories.filter(
      (category) => !isExcludedCategory(category),
    )
    const hiddenCategoryIds = new Set(
      categories
        .filter((category) => isExcludedCategory(category))
        .map((category) => category.id),
    )
    const visibleProducts = products.filter(
      (product) =>
        !product.categoryId || !hiddenCategoryIds.has(product.categoryId),
    )

    const response: PosCatalogResponse = {
      products: visibleProducts.map((product) => ({
        id: String(product.id),
        externalProductId: product.externalProductId,
        productCode: product.productCode,
        productName: product.productName,
        unitPrice: Number(product.unitPrice ?? 0),
        currency: product.currency,
        unitOfMeasure: product.unitOfMeasure,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        categoryIcon: product.categoryIcon,
        categoryImagePath: product.categoryImagePath,
      })),
      categories: visibleCategories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
        icon: category.icon,
        imagePath: category.imagePath,
        productCount: category.productCount,
      })),
      decimals,
      transactionsHref:
        user.role === 'tenant'
          ? '/transactions'
          : '/transactions?status=non-fiscalized',
    }

    return ok(response)
  },
})
