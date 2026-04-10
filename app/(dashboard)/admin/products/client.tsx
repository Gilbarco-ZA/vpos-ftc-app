'use client'

import type {
  AddProductFormState,
  buildPayload,
  ProductListItem,
  ProductStatus,
  ProductsUIContextValue,
} from '@/components/products/products.types'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { ErrorState } from '@/components/errors/ErrorState'
import { EditProductSheet } from '@/components/products/EditProductSheet'
import { ProductCategoriesSheet } from '@/components/products/ProductCategoriesSheet'
import { ProductEventLogSheet } from '@/components/products/ProductEventLogSheet'
import { normalizeStatus } from '@/components/products/products.utils'
import { ProductsAddSheetWrapper } from '@/components/products/ProductsAddSheetWrapper'
import { ProductsFiltersRow } from '@/components/products/ProductsFiltersRow'
import { ProductsTable } from '@/components/products/ProductsTable'
import { ProductStatusSheet } from '@/components/products/ProductStatusSheet'
import {
  ProductsUIContext,
  useProductsUI,
} from '@/components/products/useProductsUI'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ToastItem, ToastVariant, ToastViewport } from '@/components/ui/toast'

type ProductsPageClientProps = {
  initialProducts: ProductListItem[]
  error?: string | null
  currencyOptions: string[]
  defaultCurrency: string
  taxTypeOptions: import('@/components/products/products.types').ConfigOption[]
  isDevEnv: boolean
  children: ReactNode
}

export const ProductsAddButton = () => {
  const { openAdd } = useProductsUI()
  return (
    <Button variant="primary" onClick={openAdd}>
      Add product
    </Button>
  )
}
export const ProductsScheduleButton = () => {
  return (
    <Button asChild variant="secondary">
      <Link href="/setup/forecourt/pricing">Schedule Prices</Link>
    </Button>
  )
}

export const ProductsManageCategoriesButton = () => {
  const { openCategories } = useProductsUI()
  return (
    <Button variant="secondary" onClick={openCategories}>
      Manage categories
    </Button>
  )
}

export const ProductsPageActions = () => (
  <div className="flex items-center gap-2">
    <ProductsManageCategoriesButton />
    <ProductsScheduleButton />
    <ProductsAddButton />
  </div>
)

const ProductsPageClient = ({
  initialProducts,
  error,
  children,
  currencyOptions,
  defaultCurrency,
  taxTypeOptions,
  isDevEnv,
}: ProductsPageClientProps) => {
  const router = useRouter()

  const [products, setProducts] = useState<ProductListItem[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProductStatus | 'ALL'>('ALL')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [statusProduct, setStatusProduct] = useState<ProductListItem | null>(
    null,
  )
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [eventLogProduct, setEventLogProduct] =
    useState<ProductListItem | null>(null)

  const [toasts, setToasts] = useState<
    Array<{ id: string; variant: ToastVariant; message: string }>
  >([])

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  const showToast = useCallback((variant: ToastVariant, message: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, variant, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4000)
  }, [])

  const addProduct = useCallback((product: ProductListItem) => {
    setProducts((prev) => [product, ...prev])
  }, [])

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.code.toLowerCase().includes(search.toLowerCase()) ||
        product.sku?.toLowerCase().includes(search.toLowerCase()) ||
        false

      const matchesStatus =
        status === 'ALL' ||
        normalizeStatus(product.lastSyncStatus ?? 'UNKNOWN') === status

      return matchesSearch && matchesStatus
    })
  }, [products, search, status])

  const contextValue = useMemo<ProductsUIContextValue>(
    () => ({
      openAdd: () => setIsAddOpen(true),
      closeAdd: () => setIsAddOpen(false),
      openCategories: () => setIsCategoriesOpen(true),
      addProduct,
      showToast,
    }),
    [addProduct, showToast],
  )

  const refresh = () => router.refresh()

  const handleResync = async (product: ProductListItem) => {
    try {
      const res = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/sync`,
        { method: 'POST' },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', body?.error?.message ?? 'Sync failed')
        return
      }
      showToast('success', body?.data?.message ?? 'Sync triggered')
      router.refresh()
    } catch (err: any) {
      showToast('error', err?.message ?? 'Sync failed')
    }
  }

  const handleAddSubmit = useCallback(
    async ({
      csrfToken,
      payload,
    }: {
      csrfToken: string
      payload: ReturnType<typeof buildPayload>
      form: AddProductFormState
    }) => {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ csrf_token: csrfToken, data: [payload] }),
      })

      const body = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, body }
    },
    [],
  )

  const handleAddSuccess = useCallback(
    ({
      body,
      payload,
    }: {
      body: any
      payload: ReturnType<typeof buildPayload>
    }) => {
      const created = Array.isArray(body?.data?.products)
        ? body.data.products[0]
        : body?.data?.product || body?.data || null

      if (created) {
        addProduct({
          id: created.productId ?? payload.productId,
          name: created.productName ?? payload.productName,
          code: created.productCode ?? payload.productCode,
          sku: created.sku ?? payload.sku,
          unitPrice: Number(created.unitPrice ?? payload.unitPrice),
          currency: created.currency ?? payload.currency,
          lastSyncStatus: created.lastSyncStatus ?? 'PENDING',
          lastSynced: created.lastSyncAt ? String(created.lastSyncAt) : null,
        })
      }
      router.refresh()
    },
    [addProduct, router],
  )

  return (
    <ProductsUIContext.Provider value={contextValue}>
      {children}
      <ProductCategoriesSheet
        open={isCategoriesOpen}
        onOpenChange={setIsCategoriesOpen}
        onSaved={() => {
          showToast('success', 'Product categories updated')
          router.refresh()
        }}
      />

      <ProductsAddSheetWrapper
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        currencyOptions={currencyOptions}
        defaultCurrency={defaultCurrency}
        taxTypeOptions={taxTypeOptions}
        isDevEnv={isDevEnv}
        onSubmit={handleAddSubmit}
        onSuccess={handleAddSuccess}
      />

      <EditProductSheet
        isOpen={!!editProductId}
        onOpenChange={(open) => {
          if (!open) setEditProductId(null)
        }}
        productId={editProductId}
        currencyOptions={currencyOptions}
        defaultCurrency={defaultCurrency}
        taxTypeOptions={taxTypeOptions}
        isDevEnv={isDevEnv}
        onSaved={() => {
          setEditProductId(null)
          showToast('success', 'Product updated')
          router.refresh()
        }}
      />

      <ProductStatusSheet
        product={statusProduct}
        onClose={() => setStatusProduct(null)}
        onResync={() => statusProduct && handleResync(statusProduct)}
      />

      <ProductEventLogSheet
        product={eventLogProduct}
        onClose={() => setEventLogProduct(null)}
      />

      <ToastViewport>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} variant={toast.variant}>
            {toast.message}
          </ToastItem>
        ))}
      </ToastViewport>

      {error ? (
        <ErrorState title="" message={error} onRetry={refresh} />
      ) : (
        <div className="space-y-4">
          <ProductsFiltersRow
            search={search}
            status={status}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
            onRefresh={refresh}
          />
          {filteredProducts.length === 0 ? (
            <EmptyState
              title="No products registered"
              description="Add your first product to begin syncing inventory to the fiscal service."
              action={
                <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                  Add your first product
                </Button>
              }
            />
          ) : (
            <ProductsTable
              products={filteredProducts}
              onViewStatus={setStatusProduct}
              onViewEventLog={setEventLogProduct}
              onResync={handleResync}
              onEdit={(p) => setEditProductId(p.id)}
            />
          )}
        </div>
      )}
    </ProductsUIContext.Provider>
  )
}

export default ProductsPageClient
