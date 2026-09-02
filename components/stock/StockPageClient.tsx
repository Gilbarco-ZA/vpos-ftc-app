'use client'

import type {
  MovementForm,
  StatusMessage,
  StockMovementType,
  StockProduct,
  StockResponse,
} from '@/components/stock/stock.types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import {
  emptyStockMovementForm,
  isFutureLocalDateTime,
  localDateTimeToIso,
} from '@/components/stock/stock.helpers'
import { StockMovementHistory } from '@/components/stock/StockMovementHistory'
import { StockMovementSheet } from '@/components/stock/StockMovementSheet'
import { StockOverviewTable } from '@/components/stock/StockOverviewTable'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'

const EMPTY_STOCK_RESPONSE: StockResponse = {
  products: [],
  recentMovements: [],
}

export default function StockPageClient() {
  const [csrfToken, setCsrfToken] = useState('')
  const [data, setData] = useState<StockResponse>(EMPTY_STOCK_RESPONSE)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [historyProductId, setHistoryProductId] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<MovementForm>(() => emptyStockMovementForm())

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/stock', { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error?.message || 'Failed to load product stock.')
      }
      setData(body?.data ?? EMPTY_STOCK_RESPONSE)
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Failed to load product stock.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data.products
    return data.products.filter((product) =>
      [
        product.productName,
        product.productCode,
        product.productId,
        product.sku,
        product.categoryName,
        product.categoryCode,
      ].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(query),
      ),
    )
  }, [data.products, search])

  const displayedMovements = useMemo(() => {
    if (!historyProductId) return data.recentMovements
    return data.recentMovements.filter(
      (movement) => movement.productRecordId === historyProductId,
    )
  }, [data.recentMovements, historyProductId])

  const totals = useMemo(
    () => ({
      products: data.products.length,
      quantity: data.products.reduce(
        (sum, product) => sum + product.availableQuantity,
        0,
      ),
      pending: data.products.reduce(
        (sum, product) => sum + product.proxyPendingCount,
        0,
      ),
      failed: data.products.reduce(
        (sum, product) => sum + product.proxyFailedCount,
        0,
      ),
    }),
    [data.products],
  )

  const selectedProduct = useMemo(
    () => data.products.find((product) => product.id === form.productRecordId),
    [data.products, form.productRecordId],
  )

  const openMovement = (
    movementType: StockMovementType,
    product?: StockProduct,
  ) => {
    setStatus(null)
    setForm(emptyStockMovementForm(movementType, product))
    setSheetOpen(true)
  }

  const validateForm = () => {
    const quantity = Number(form.quantity)
    const unitCost = form.unitCost.trim() ? Number(form.unitCost) : null

    if (!form.productRecordId) return 'Select a product.'
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 'Quantity must be greater than zero.'
    }
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return 'Unit cost is invalid.'
    }
    if (!form.effectiveAtLocal) {
      return 'Effective date and time is required.'
    }
    if (!localDateTimeToIso(form.effectiveAtLocal)) {
      return 'Effective date and time is invalid.'
    }
    if (isFutureLocalDateTime(form.effectiveAtLocal)) {
      return 'Effective date and time cannot be in the future.'
    }
    if (form.movementType === 'STOCK_OUT' && !form.documentReference.trim()) {
      return 'Reference document is required for stock out.'
    }
    if (form.reason === 'Other' && !form.remarks.trim()) {
      return 'Remarks are required for an Other adjustment.'
    }
    return null
  }

  const submitMovement = async () => {
    setStatus(null)
    const validationError = validateForm()
    if (validationError) {
      setStatus({ type: 'error', message: validationError })
      return
    }

    const quantity = Number(form.quantity)
    const unitCost = form.unitCost.trim() ? Number(form.unitCost) : null
    const effectiveAt = localDateTimeToIso(form.effectiveAtLocal)
    if (!effectiveAt) {
      setStatus({
        type: 'error',
        message: 'Effective date and time is invalid.',
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          data: {
            productRecordId: form.productRecordId,
            movementType: form.movementType,
            reason: form.reason,
            quantity,
            unitCost,
            effectiveAt,
            documentReference: form.documentReference || null,
            remarks: form.remarks || null,
            supplierName: form.supplierName || null,
            supplierPin: form.supplierPin || null,
            supplierInvoiceNumber: form.supplierInvoiceNumber || null,
          },
          csrf_token: csrfToken,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          body?.error?.message || 'Failed to save stock movement.',
        )
      }

      await loadData()
      setSheetOpen(false)
      const proxyFailed = body?.data?.proxy?.success === false
      setStatus({
        type: proxyFailed ? 'warn' : 'success',
        message: proxyFailed
          ? 'Stock movement was saved locally, but the vpos-proxy update failed. Retry it from movement history.'
          : 'Stock movement was saved and sent through vpos-proxy.',
      })
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save stock movement.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const retryMovement = async (movementId: string) => {
    setRetryingId(movementId)
    setStatus(null)
    try {
      const response = await fetch(`/api/stock/${movementId}/retry`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ csrf_token: csrfToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error?.message || 'Proxy retry failed.')
      }
      await loadData()
      setStatus({
        type: 'success',
        message: 'Stock movement was sent through vpos-proxy.',
      })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Proxy retry failed.',
      })
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />

      <PageHeader
        title="Product Stock"
        description="Manage non-fuel stock. POS sales and non-fiscalized transaction edits reconcile local stock automatically; invoice submission updates cloud sale quantities. Manual and CSV stock movements are sent through vpos-proxy."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => openMovement('STOCK_OUT')}
            >
              Stock Out
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => openMovement('STOCK_IN')}
            >
              Stock In
            </Button>
          </div>
        }
      />

      {status && <Alert variant={status.type}>{status.message}</Alert>}
      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Managed products" value={String(totals.products)} />
        <StatCard
          label="Aggregate quantity on hand"
          value={totals.quantity.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        />
        <StatCard label="Pending proxy sends" value={String(totals.pending)} />
        <StatCard label="Failed proxy sends" value={String(totals.failed)} />
      </div>

      <StockOverviewTable
        products={filteredProducts}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        onHistory={setHistoryProductId}
        onMovement={openMovement}
      />

      <StockMovementHistory
        movements={displayedMovements}
        isFiltered={Boolean(historyProductId)}
        retryingId={retryingId}
        retryEnabled={Boolean(csrfToken)}
        onClearFilter={() => setHistoryProductId(null)}
        onRetry={retryMovement}
      />

      <StockMovementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        form={form}
        setForm={setForm}
        products={data.products}
        selectedProduct={selectedProduct}
        isSaving={isSaving}
        submitEnabled={Boolean(csrfToken)}
        onSubmit={submitMovement}
      />
    </div>
  )
}
