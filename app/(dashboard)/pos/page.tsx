import { requireAuth } from '@/src/shared/auth'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

import { listProductCategories } from '@/src/modules/products/application/queries/list-product-categories'
import { listTransactionCatalogProducts } from '@/src/modules/transactions/application/queries/list-transaction-catalog-products'

import ProvisionalPosPageClient from '@/components/pos/ProvisionalPosPageClient'

export const dynamic = 'force-dynamic'

const EXCLUDED_POS_CATEGORY_CODES = new Set(['FUEL'])
const EXCLUDED_POS_CATEGORY_NAMES = new Set(['fuel'])

const isExcludedPosCategory = (category: {
  code?: string | null
  name?: string | null
}) =>
  EXCLUDED_POS_CATEGORY_CODES.has(String(category.code || '').toUpperCase()) ||
  EXCLUDED_POS_CATEGORY_NAMES.has(
    String(category.name || '')
      .trim()
      .toLowerCase(),
  )

const PosPage = async () => {
  const user = await requireAuth(['tenant', 'manager', 'administrator'])
  const [products, categories, decimals] = await Promise.all([
    listTransactionCatalogProducts(user.stationId),
    listProductCategories({ stationId: user.stationId }),
    getStationDecimalSettings(user.stationId),
  ])

  const visibleCategories = categories.filter(
    (category) => !isExcludedPosCategory(category),
  )
  const hiddenCategoryIds = new Set(
    visibleCategories.length === categories.length
      ? []
      : categories
          .filter((category) => isExcludedPosCategory(category))
          .map((category) => category.id),
  )
  const visibleProducts = products.filter(
    (product) =>
      !product.categoryId || !hiddenCategoryIds.has(product.categoryId),
  )

  return (
    <ProvisionalPosPageClient
      products={visibleProducts.map((product) => ({
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
      }))}
      categories={visibleCategories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
        icon: category.icon,
        imagePath: category.imagePath,
        productCount: category.productCount,
      }))}
      decimals={decimals}
      transactionsHref={
        user.role === 'tenant'
          ? '/transactions'
          : '/transactions?status=non-fiscalized'
      }
    />
  )
}

export default PosPage
