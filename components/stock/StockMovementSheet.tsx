'use client'

import type { MovementForm, StockProduct } from '@/components/stock/stock.types'
import type { Dispatch, SetStateAction } from 'react'

import {
  formatStockQuantity,
  localDateTimeInputValue,
  STOCK_IN_REASONS,
  STOCK_OUT_REASONS,
} from '@/components/stock/stock.helpers'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

type StockMovementSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: MovementForm
  setForm: Dispatch<SetStateAction<MovementForm>>
  products: StockProduct[]
  selectedProduct?: StockProduct
  isSaving: boolean
  submitEnabled: boolean
  onSubmit: () => void
}

export function StockMovementSheet({
  open,
  onOpenChange,
  form,
  setForm,
  products,
  selectedProduct,
  isSaving,
  submitEnabled,
  onSubmit,
}: StockMovementSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] overflow-y-auto sm:w-[40rem]">
        <SheetHeader>
          <SheetTitle>
            {form.movementType === 'STOCK_IN' ? 'Stock in' : 'Stock out'}
          </SheetTitle>
          <SheetDescription>
            The movement is committed locally first, then transmitted through
            vpos-proxy using the station&apos;s persisted proxy configuration.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <FormField label="Product" required>
            <Select
              value={form.productRecordId}
              onChange={(event) => {
                const product = products.find(
                  (entry) => entry.id === event.target.value,
                )
                setForm((current) => ({
                  ...current,
                  productRecordId: event.target.value,
                  unitCost:
                    !current.unitCost && product
                      ? String(product.unitCost ?? 0)
                      : current.unitCost,
                }))
              }}
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.productName} ({product.productCode})
                </option>
              ))}
            </Select>
          </FormField>

          {selectedProduct && (
            <Alert variant="info">
              Available:{' '}
              {formatStockQuantity(
                selectedProduct.availableQuantity,
                selectedProduct.unitOfMeasure,
              )}
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Reason" required>
              <Select
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
              >
                {(form.movementType === 'STOCK_IN'
                  ? STOCK_IN_REASONS
                  : STOCK_OUT_REASONS
                ).map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Effective date and time" required>
              <Input
                type="datetime-local"
                max={localDateTimeInputValue()}
                step="60"
                value={form.effectiveAtLocal}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    effectiveAtLocal: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField label="Quantity" required>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField
              label="Unit cost"
              helpText={
                form.movementType === 'STOCK_OUT'
                  ? 'Optional. Used for the proxy document value.'
                  : undefined
              }
            >
              <Input
                type="number"
                min="0"
                step="any"
                value={form.unitCost}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    unitCost: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>

          {form.movementType === 'STOCK_IN' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Supplier name">
                <Input
                  maxLength={45}
                  value={form.supplierName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierName: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Supplier TIN/PIN">
                <Input
                  maxLength={45}
                  value={form.supplierPin}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierPin: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Supplier invoice number">
                <Input
                  maxLength={45}
                  value={form.supplierInvoiceNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierInvoiceNumber: event.target.value,
                    }))
                  }
                />
              </FormField>
            </div>
          ) : (
            <FormField label="Reference document" required>
              <Input
                value={form.documentReference}
                maxLength={45}
                placeholder="Invoice, damage report or transfer reference"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    documentReference: event.target.value,
                  }))
                }
              />
            </FormField>
          )}

          <FormField label="Remarks" required={form.reason === 'Other'}>
            <Textarea
              maxLength={500}
              value={form.remarks}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  remarks: event.target.value,
                }))
              }
            />
          </FormField>
        </div>

        <SheetFooter className="mt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={form.movementType === 'STOCK_IN' ? 'primary' : 'secondary'}
            disabled={isSaving || !submitEnabled}
            onClick={onSubmit}
          >
            {isSaving
              ? 'Saving...'
              : form.movementType === 'STOCK_IN'
                ? 'Record Stock In'
                : 'Record Stock Out'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
