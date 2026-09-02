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

import { ErrorState } from '@/components/errors/ErrorState'
import { EditProductSheet } from '@/components/products/EditProductSheet'
import { ProductEventLogSheet } from '@/components/products/ProductEventLogSheet'
import { normalizeStatus } from '@/components/products/products.utils'
import { ProductsAddSheetWrapper } from '@/components/products/ProductsAddSheetWrapper'
import { ProductsFiltersRow } from '@/components/products/ProductsFiltersRow'
import { ProductsImportSheet } from '@/components/products/ProductsImportSheet'
import { ProductsTable } from '@/components/products/ProductsTable'
import { ProductStatusSheet } from '@/components/products/ProductStatusSheet'
import {
  ProductsUIContext,
  useProductsUI,
} from '@/components/products/useProductsUI'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ToastItem, ToastVariant, ToastViewport } from '@/components/ui/toast'

type ProductsPageClientProps = {
  initialProducts: ProductListItem[]
  error?: string | null
  defaultCurrency: string
  taxTypeOptions: import('@/components/products/products.types').ConfigOption[]
  isDevEnv: boolean
  isRefreshing: boolean
  onRefresh: () => Promise<void>
  children: ReactNode
}

export const ProductsImportButton = () => {
  const { openImport } = useProductsUI()
  return (
    <Button variant="secondary" onClick={openImport}>
      Import CSV
    </Button>
  )
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
  return (
    <Button asChild variant="secondary">
      <Link href="/admin/products/categories">Manage categories</Link>
    </Button>
  )
}

export const ProductsPageActions = () => (
  <div className="flex flex-wrap items-center gap-2">
    <ProductsManageCategoriesButton />
    <ProductsScheduleButton />
    <ProductsImportButton />
    <ProductsAddButton />
  </div>
)

const ProductsPageClient = ({
  initialProducts,
  error,
  children,
  defaultCurrency,
  taxTypeOptions,
  isDevEnv,
  isRefreshing,
  onRefresh,
}: ProductsPageClientProps) => {
  const [products, setProducts] = useState<ProductListItem[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProductStatus | 'ALL'>('ALL')
  const [csrfToken, setCsrfToken] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
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
    queueMicrotask(() => setProducts(initialProducts))
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
      openImport: () => setIsImportOpen(true),
      closeAdd: () => setIsAddOpen(false),
      addProduct,
      showToast,
    }),
    [addProduct, showToast],
  )

  const refresh = useCallback(() => {
    void onRefresh()
  }, [onRefresh])

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
      await onRefresh()
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
      void onRefresh()
    },
    [addProduct, onRefresh],
  )

  return (
    <ProductsUIContext.Provider value={contextValue}>
      <CsrfBootstrap onToken={setCsrfToken} />
      {children}
      <ProductsImportSheet
        isOpen={isImportOpen}
        onOpenChange={setIsImportOpen}
        csrfToken={csrfToken}
        onImported={(result) => {
          const proxyWarning =
            result.stockProxyFailureCount > 0
              ? ` ${result.stockProxyFailureCount} stock update${result.stockProxyFailureCount === 1 ? '' : 's'} require retry from Product Stock.`
              : ''
          const proxyPendingWarning =
            result.stockProxyPendingCount > 0
              ? ` ${result.stockProxyPendingCount} stock update${result.stockProxyPendingCount === 1 ? ' remains' : 's remain'} pending until product sync succeeds.`
              : ''
          const productSyncWarning =
            result.productSync && result.productSync.status !== 'synced'
              ? ` ${result.productSync.message}`
              : ''
          const hasWarnings =
            result.stockProxyFailureCount > 0 ||
            result.stockProxyPendingCount > 0 ||
            productSyncWarning.length > 0
          showToast(
            hasWarnings ? 'info' : 'success',
            `Imported ${result.importedProductCount} product${result.importedProductCount === 1 ? '' : 's'} and created ${result.stockMovementCount} stock movement${result.stockMovementCount === 1 ? '' : 's'}.${proxyWarning}${proxyPendingWarning}${productSyncWarning}`,
          )
          void onRefresh()
        }}
      />

      <ProductsAddSheetWrapper
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
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
        defaultCurrency={defaultCurrency}
        taxTypeOptions={taxTypeOptions}
        isDevEnv={isDevEnv}
        onSaved={() => {
          setEditProductId(null)
          showToast('success', 'Product updated')
          void onRefresh()
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
            isRefreshing={isRefreshing}
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
