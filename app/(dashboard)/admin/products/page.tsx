import type { ProductListItem } from '@/components/products/products.types'
import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import {
  getCurrencyOptions,
  getDefaultCurrency,
  getTaxTypeOptions,
  normalizeProductsForDisplay,
} from '@/src/modules/products/application/product-display'
import { listProducts } from '@/src/modules/products/application/queries/list-products'

import { PageHeader } from '@/components/layout/page-header'

import ProductsPageClient, { ProductsPageActions } from './client'

export const dynamic = 'force-dynamic'

const AdminProductsPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  let products: ProductListItem[] = []
  let error: string | null = null
  try {
    const rows = await listProducts({ stationId: user.stationId })
    products = normalizeProductsForDisplay(rows)
  } catch (err: any) {
    error = err?.message ?? 'Failed to load products'
  }

  const currencyOptions = getCurrencyOptions(user.station?.country)
  const defaultCurrency = getDefaultCurrency(user.station?.country)
  const taxTypeOptions = getTaxTypeOptions(user.station?.country)
  const isDevEnv = process.env.NODE_ENV !== 'production'

  return (
    <ProductsPageClient
      initialProducts={products}
      error={error}
      currencyOptions={currencyOptions}
      defaultCurrency={defaultCurrency}
      taxTypeOptions={taxTypeOptions}
      isDevEnv={isDevEnv}
    >
      <PageHeader
        title="Products"
        description="Register products and view sync status"
        actions={<ProductsPageActions />}
      />
    </ProductsPageClient>
  )
}

export default AdminProductsPage
