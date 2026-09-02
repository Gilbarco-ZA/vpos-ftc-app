'use client'

import type {
  ConfigOption,
  ProductListItem,
} from '@/components/products/products.types'
import { useCallback, useEffect, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { PageSkeleton } from '@/components/ui/page-skeleton'

import ProductsPageClient, { ProductsPageActions } from './client'

type ProductsPageData = {
  products: ProductListItem[]
  defaultCurrency: string
  taxTypeOptions: ConfigOption[]
  isDevEnv: boolean
}

export function ProductsPageLoader() {
  const [data, setData] = useState<ProductsPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasLoadedData = useRef(false)

  const loadPageData = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/admin/products/page-data', {
        cache: 'no-store',
        signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error?.message || 'Failed to load products')
      }

      hasLoadedData.current = true
      setData(body.data)
      setError(null)
    } catch (reason) {
      if (signal?.aborted) return

      // Keep the last good table visible when a background refresh fails.
      if (!hasLoadedData.current) {
        setError(
          reason instanceof Error ? reason.message : 'Failed to load products',
        )
      }
    }
  }, [])

  const refreshPageData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadPageData()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadPageData])

  useEffect(() => {
    const controller = new AbortController()
    void loadPageData(controller.signal)

    return () => controller.abort()
  }, [loadPageData])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadPageData()
      }
    }

    const intervalId = window.setInterval(refreshWhenVisible, 5000)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadPageData])

  if (!data && !error) return <PageSkeleton rows={8} />

  return (
    <ProductsPageClient
      initialProducts={data?.products ?? []}
      error={error}
      defaultCurrency={data?.defaultCurrency ?? 'USD'}
      taxTypeOptions={data?.taxTypeOptions ?? []}
      isDevEnv={data?.isDevEnv ?? false}
      isRefreshing={isRefreshing}
      onRefresh={refreshPageData}
    >
      <PageHeader
        title="Products"
        description="Register products and view sync status"
        actions={<ProductsPageActions />}
      />
    </ProductsPageClient>
  )
}
