import { useEffect, useState } from 'react'

import { api } from '@/src/shared/api/fetch'

import { Sheet, SheetContent } from '../ui/sheet'
import { AddProductFormState, createEmptyForm } from './products.types'
import { ProductsUpsertSheetContent } from './ProductsUpsertSheetContent'
import { useProductsUI } from './useProductsUI'

export const EditProductSheet = ({
  isOpen,
  onOpenChange,
  productId,
  currencyOptions,
  defaultCurrency,
  taxTypeOptions,
  isDevEnv,
  onSaved,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  productId: string | null
  currencyOptions: string[]
  defaultCurrency: string
  taxTypeOptions: import('./products.types').ConfigOption[]
  isDevEnv: boolean
  /** Called after save so caller can refresh list or update a row */
  onSaved?: () => void
}) => {
  const { showToast } = useProductsUI()
  const [loading, setLoading] = useState(false)
  const [initialValues, setInitialValues] = useState<
    Partial<AddProductFormState> | undefined
  >(undefined)

  useEffect(() => {
    if (!isOpen || !productId) return

    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await api(
          `/api/products/${encodeURIComponent(productId)}`,
          {
            cache: 'no-store',
          },
        )
        if (!res.ok) {
          showToast('error', res?.message ?? 'Failed to load product')
          return
        }

        const p: any = res.data

        // Map server product -> form state
        const mapped: Partial<AddProductFormState> = {
          // Base (serving machine) fields
          productId: String(p.productId ?? ''),
          productCode: String(p.productCode ?? ''),
          productName: String(p.productName ?? ''),
          productClassCode: String(p.productClassCode ?? ''),
          productTypeCode: String(p.productTypeCode ?? ''),
          unitPrice: p.unitPrice != null ? String(p.unitPrice) : '',
          unitCost: p.unitCost != null ? String(p.unitCost) : '',
          currency: String(p.currency ?? ''),
          taxRate: p.taxRate != null ? String(p.taxRate) : '16',
          sku: String(p.sku ?? ''),
          barcode: String(p.barcode ?? ''),
          categoryId: String(p.categoryId ?? ''),
          category: String(p.categoryName ?? p.category ?? ''),
          unitOfMeasure: String(p.unitOfMeasure ?? ''),
          unitOfPackaging: String(p.unitOfPackaging ?? ''),
          packSize: p.packSize != null ? String(p.packSize) : '',
          taxCode: String(p.taxCode ?? ''),
          commodityCode: String(p.commodityCode ?? ''),
          hazardousIndicator: Boolean(p.hazardousIndicator),
          devFlowOverride: String(p.devFlowOverride ?? '') as
            | ''
            | 'offline'
            | 'timeout',

          // External override fields (used for proxy/cloud)
          extProductId: String(p.extProductId ?? p.productId ?? ''),
          extProductCode: String(p.extProductCode ?? p.productCode ?? ''),
          extDescription: String(p.extDescription ?? p.productName ?? ''),
          extProductClassCode: String(
            p.extProductClassCode ?? p.productClassCode ?? '',
          ),
          extProductTypeCode: String(
            p.extProductTypeCode ?? p.productTypeCode ?? '',
          ),
          extUnitOfMeasure: String(p.extUnitOfMeasure ?? p.unitOfMeasure ?? ''),
          extUnitOfPackaging: String(
            p.extUnitOfPackaging ?? p.unitOfPackaging ?? '',
          ),
          extUnitPrice:
            p.extUnitPrice != null
              ? String(p.extUnitPrice)
              : p.unitPrice != null
                ? String(p.unitPrice)
                : '',
          extCurrency: String(p.extCurrency ?? p.currency ?? ''),
          extTaxCode: String(p.extTaxCode ?? p.taxCode ?? ''),
          extHazardousIndicator: Boolean(
            p.extHazardousIndicator ?? p.hazardousIndicator ?? true,
          ),
        }

        if (mounted) setInitialValues(mapped)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [isOpen, productId, defaultCurrency, showToast])

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-dvh flex-col p-0">
        {loading || !initialValues ? (
          <div className="p-6 text-sm text-[var(--text-secondary)]">
            Loading...
          </div>
        ) : (
          <ProductsUpsertSheetContent
            title="Edit product"
            submitLabel="Save changes"
            onClose={() => onOpenChange(false)}
            currencyOptions={currencyOptions}
            defaultCurrency={defaultCurrency}
            taxTypeOptions={taxTypeOptions}
            isDevEnv={isDevEnv}
            initialValues={{
              ...createEmptyForm(defaultCurrency),
              ...initialValues,
            }}
            onSubmit={async ({ csrfToken, payload }) => {
              const res = await fetch('/api/products', {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  'x-csrf-token': csrfToken,
                },
                body: JSON.stringify({
                  csrf_token: csrfToken,
                  data: [payload],
                }),
              })
              const body = await res.json().catch(() => ({}))
              return { ok: res.ok, body }
            }}
            onSuccess={() => {
              onSaved?.()
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
