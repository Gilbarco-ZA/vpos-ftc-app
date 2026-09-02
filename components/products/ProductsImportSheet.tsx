'use client'

import { useEffect, useState } from 'react'
import { Download, Upload } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const FIELD_ORDER =
  'productId, productCode, productName, productClassCode, productTypeCode, unitPrice, unitCost, currency, taxRate, taxCode, category, sku, barcode, unitOfMeasure, unitOfPackaging, packSize, commodityCode, hazardousIndicator, stockQuantity, stockUpdateMode'

type ImportResult = {
  importedProductCount: number
  stockMovementCount: number
  stockProxyFailureCount: number
  stockProxyPendingCount: number
  productSync?: {
    ok: boolean
    status: 'synced' | 'pending' | 'failed'
    message: string
  }
}

type ProductsImportSheetProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  csrfToken: string
  onImported: (result: ImportResult) => void
}

export function ProductsImportSheet({
  isOpen,
  onOpenChange,
  csrfToken,
  onImported,
}: ProductsImportSheetProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) {
      setFile(null)
      setError(null)
      setValidationErrors([])
      setIsImporting(false)
    }
  }, [isOpen])

  const submit = async () => {
    if (!file) {
      setError('Select a CSV file to import.')
      return
    }
    if (!csrfToken) {
      setError('Security token is still loading. Try again shortly.')
      return
    }

    setIsImporting(true)
    setError(null)
    setValidationErrors([])
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('csrf_token', csrfToken)

      const response = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: formData,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        const details = body?.error?.details?.errors
        if (Array.isArray(details)) {
          setValidationErrors(details.map((item: unknown) => String(item)))
        }
        throw new Error(body?.error?.message || 'Product import failed.')
      }

      const result = body?.data as ImportResult
      onImported(result)
      onOpenChange(false)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Product import failed.',
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import products and stock</SheetTitle>
          <SheetDescription>
            Import up to 1,000 products. Existing products are updated by
            productId; blank productId values use productCode.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
          {error && <Alert variant="error">{error}</Alert>}
          {validationErrors.length > 0 && (
            <Alert variant="error" title="CSV validation details">
              <ul className="list-disc space-y-1 pl-5">
                {validationErrors.slice(0, 30).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
              {validationErrors.length > 30 && (
                <div className="mt-2">
                  {validationErrors.length - 30} additional errors were omitted.
                </div>
              )}
            </Alert>
          )}

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
            <div className="font-medium text-[var(--text-primary)]">
              Stock quantity behavior
            </div>
            <div className="mt-2 space-y-1">
              <p>
                <b>SET</b> reconciles the local balance to stockQuantity. Use it
                for full stock counts and initial stock.
              </p>
              <p>
                <b>ADD</b> adds stockQuantity to the current balance. Use it for
                incoming stock.
              </p>
              <p>
                Leave both stock fields blank to import or update the product
                without changing stock. Fuel-category products must leave stock
                fields blank.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">
                CSV template
              </label>
              <Button asChild type="button" variant="secondary" size="sm">
                <a href="/api/products/import">
                  <Download className="mr-2 h-4 w-4" />
                  Download template
                </a>
              </Button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Keep this exact column order:
            </p>
            <div className="overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-secondary)]">
              {FIELD_ORDER}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              category accepts an existing category code or category name.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="product-import-file"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Completed CSV file
            </label>
            <Input
              id="product-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setError(null)
                setValidationErrors([])
              }}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Maximum size: 5 MB. The import is validated before any rows are
              committed.
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isImporting || !file || !csrfToken}
            onClick={() => void submit()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? 'Importing...' : 'Import products'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
