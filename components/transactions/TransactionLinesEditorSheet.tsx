'use client'

import type {
  TransactionBuilderLine,
  TransactionBuilderProduct,
  TransactionFuelSelection,
} from '@/components/transactions/TransactionProductEditor'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useEffect, useMemo, useState } from 'react'

import TransactionProductEditor from '@/components/transactions/TransactionProductEditor'
import { Alert } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const parseErrorMessage = (body: any, fallback: string) => {
  return String(body?.error?.message || fallback)
}

type TransactionLinesEditorSheetProps = {
  open: boolean
  transactionId: string | null
  products: TransactionBuilderProduct[]
  decimals: DecimalSettings
  csrfToken: string
  onClose: () => void
  onSaved: (result: any) => void
  showToast: (variant: 'success' | 'error', message: string) => void
}

export default function TransactionLinesEditorSheet({
  open,
  transactionId,
  products,
  decimals,
  csrfToken,
  onClose,
  onSaved,
  showToast,
}: TransactionLinesEditorSheetProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editable, setEditable] = useState(true)
  const [fuelItemsLocked, setFuelItemsLocked] = useState(false)
  const [lockedProductIds, setLockedProductIds] = useState<string[]>([])
  const [excludeFuelProductsFromCatalog, setExcludeFuelProductsFromCatalog] =
    useState(false)
  const [editabilityReason, setEditabilityReason] = useState<string | null>(
    null,
  )
  const [initialLines, setInitialLines] = useState<TransactionBuilderLine[]>([])
  const [initialFuelSelection, setInitialFuelSelection] =
    useState<TransactionFuelSelection | null>(null)

  useEffect(() => {
    const loadLines = async () => {
      if (!open || !transactionId) return
      setLoading(true)
      setError(null)
      setEditable(true)
      setFuelItemsLocked(false)
      setLockedProductIds([])
      setExcludeFuelProductsFromCatalog(false)
      setEditabilityReason(null)
      try {
        const res = await fetch(
          `/api/transactions/${encodeURIComponent(transactionId)}/lines`,
          { cache: 'no-store' },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.ok === false) {
          setError(parseErrorMessage(body, 'Failed to load transaction lines.'))
          return
        }
        const lines = Array.isArray(body?.data?.lines) ? body.data.lines : []
        const nextEditable = body?.data?.editable !== false
        setEditable(nextEditable)
        setFuelItemsLocked(Boolean(body?.data?.fuelItemsLocked))
        setLockedProductIds(
          Array.isArray(body?.data?.lockedProductIds)
            ? body.data.lockedProductIds.map((value: unknown) => String(value))
            : [],
        )
        setExcludeFuelProductsFromCatalog(
          Boolean(body?.data?.excludeFuelProductsFromCatalog),
        )
        setEditabilityReason(
          body?.data?.editabilityReason
            ? String(body.data.editabilityReason)
            : nextEditable
              ? null
              : 'This transaction is read-only.',
        )
        setInitialLines(
          lines.map((line: any) => ({
            productId: String(line?.productId ?? ''),
            productCode: line?.productCode ?? null,
            productName: String(line?.productName ?? 'Unknown product'),
            quantity: Number(line?.quantity ?? 0),
            unitPrice: Number(line?.unitPrice ?? 0),
            currency: line?.currency ?? null,
            categoryName: line?.categoryName ?? null,
            isFuel: Boolean(line?.isFuel),
          })),
        )
        setInitialFuelSelection(body?.data?.fuelSelection ?? null)
      } catch (err: any) {
        setError(String(err?.message || 'Failed to load transaction lines.'))
      } finally {
        setLoading(false)
      }
    }

    loadLines()
  }, [open, transactionId])

  const resetKey = useMemo(
    () =>
      `${transactionId || 'none'}:${initialLines.length}:${String(initialFuelSelection?.tankId || '')}:${String(initialFuelSelection?.nozzleId || '')}:${String(initialFuelSelection?.gradeId || '')}`,
    [transactionId, initialLines.length, initialFuelSelection],
  )

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-5xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Edit transaction items</SheetTitle>
        </SheetHeader>
        <div className="px-6 py-4">
          {loading ? (
            <div className="text-sm text-[var(--text-muted)]">
              Loading transaction items…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !editable ? (
            <Alert variant="warn" title="Transaction items are read-only">
              {editabilityReason}
            </Alert>
          ) : (
            <div className="space-y-4">
              {fuelItemsLocked ? (
                <Alert variant="info" title="Pump fuel item locked">
                  {editabilityReason ||
                    'The fuel item is fixed, but non-fuel products can still be added, changed, or removed.'}
                </Alert>
              ) : null}
              <TransactionProductEditor
                products={products}
                initialLines={initialLines}
                initialFuelSelection={initialFuelSelection}
                decimals={decimals}
                resetKey={resetKey}
                catalogDisplay="picker"
                allowFuelSelectionEditing={false}
                lockedProductIds={lockedProductIds}
                excludeFuelProductsFromCatalog={excludeFuelProductsFromCatalog}
                submitLabel="Save updated items"
                submitBusyLabel="Saving items…"
                onSubmit={async (payload) => {
                  if (!transactionId) {
                    throw new Error('Transaction ID is missing.')
                  }

                  const res = await fetch(
                    `/api/transactions/${encodeURIComponent(transactionId)}/lines`,
                    {
                      method: 'POST',
                      headers: {
                        'content-type': 'application/json',
                        'x-csrf-token': csrfToken,
                      },
                      body: JSON.stringify({
                        csrf_token: csrfToken,
                        lines: payload.lines,
                        removedProductIds: payload.removedProductIds,
                        fuelSelection: payload.fuelSelection,
                      }),
                    },
                  )
                  const body = await res.json().catch(() => ({}))
                  if (!res.ok || body?.ok === false) {
                    throw new Error(
                      parseErrorMessage(
                        body,
                        'Could not save transaction items.',
                      ),
                    )
                  }

                  const result = body?.data ?? body
                  showToast('success', 'Transaction items and stock updated')
                  onSaved(result)
                }}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
