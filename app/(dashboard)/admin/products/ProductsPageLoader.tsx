'use client'

import type {
  ConfigOption,
  ProductListItem,
} from '@/components/products/products.types'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { PageSkeleton } from '@/components/ui/page-skeleton'

import ProductsPageClient, { ProductsPageActions } from './client'

type ProductsPageData = {
  products: ProductListItem[]
  currencyOptions: string[]
  defaultCurrency: string
  taxTypeOptions: ConfigOption[]
  isDevEnv: boolean
}

export function ProductsPageLoader() {
  const [data, setData] = useState<ProductsPageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch('/api/admin/products/page-data', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body?.ok === false) {
          throw new Error(body?.error?.message || 'Failed to load products')
        }
        setData(body.data)
      } catch (reason) {
        if (controller.signal.aborted) return
        setError(
          reason instanceof Error ? reason.message : 'Failed to load products',
        )
      }
    })()

    return () => controller.abort()
  }, [])

  if (!data && !error) return <PageSkeleton rows={8} />

  return (
    <ProductsPageClient
      initialProducts={data?.products ?? []}
      error={error}
      currencyOptions={data?.currencyOptions ?? []}
      defaultCurrency={data?.defaultCurrency ?? 'USD'}
      taxTypeOptions={data?.taxTypeOptions ?? []}
      isDevEnv={data?.isDevEnv ?? false}
    >
      <PageHeader
        title="Products"
        description="Register products and view sync status"
        actions={<ProductsPageActions />}
      />
    </ProductsPageClient>
  )
}
