import { useEffect, useState } from 'react'
import Link from 'next/link'

import CsrfBootstrap from '../security/CsrfBootstrap'
import { CsrfHiddenInput } from '../security/CsrfHiddenInput'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { SearchableSelect } from '../ui/searchable-select'
import { Select } from '../ui/select'
import { SheetFooter, SheetHeader, SheetTitle } from '../ui/sheet'
import {
  CategoryIconChip,
  CategoryIconGlyph,
  getCategoryIconLabel,
} from './category-icons'
import {
  AddProductFormErrors,
  AddProductFormState,
  buildPayload,
  createEmptyForm,
  withPackagingSelection,
  withStationCurrency,
} from './products.types'
import { useProductConfigOptions } from './useProductConfigOptions'
import { useProductsUI } from './useProductsUI'

export type ProductsUpsertSheetContentProps = {
  title: string
  submitLabel?: string
  onClose: () => void
  defaultCurrency: string
  taxTypeOptions: import('./products.types').ConfigOption[]
  isDevEnv: boolean
  initialValues?: Partial<AddProductFormState> | null
  onSubmit: (args: {
    csrfToken: string
    payload: ReturnType<typeof buildPayload>
    form: AddProductFormState
  }) => Promise<{ ok: boolean; status?: number; body?: any }>
  onSuccess?: (args: {
    body: any
    payload: ReturnType<typeof buildPayload>
  }) => void
}

export const ProductsUpsertSheetContent = ({
  title,
  submitLabel = 'Save',
  onClose,
  defaultCurrency,
  taxTypeOptions,
  isDevEnv,
  initialValues,
  onSubmit,
  onSuccess,
}: ProductsUpsertSheetContentProps) => {
  const { showToast } = useProductsUI()
  const [csrfToken, setCsrfToken] = useState('')
  const [form, setForm] = useState<AddProductFormState>(() => ({
    ...createEmptyForm(defaultCurrency),
    ...(initialValues ?? {}),
  }))
  const [errors, setErrors] = useState<AddProductFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    configLoading,
    configError,
    productClassOptions,
    productTypeOptions,
    packSizeOptions,
    unitOptions,
    categoryOptions,
  } = useProductConfigOptions()
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialValues))

  useEffect(() => {
    if (!taxTypeOptions.length) return

    queueMicrotask(() =>
      setForm((prev) => {
        if ((prev.taxRate || '').trim()) return prev

        const selectedCode = (prev.extTaxCode || prev.taxCode || '').trim()
        if (!selectedCode) return prev

        const match = taxTypeOptions.find(
          (option) => option.code === selectedCode,
        )
        if (!match || match.rate == null) return prev

        return {
          ...prev,
          taxRate: String(match.rate),
        }
      }),
    )
  }, [taxTypeOptions])

  // If initialValues change (e.g. switching which product is being edited), update form.
  useEffect(() => {
    if (!initialValues) return
    queueMicrotask(() => {
      setForm((prev) =>
        withStationCurrency({ ...prev, ...initialValues }, defaultCurrency),
      )
      setAdvancedOpen(true)
    })
  }, [defaultCurrency, initialValues])

  useEffect(() => {
    queueMicrotask(() =>
      setForm((prev) => {
        if (
          prev.currency === defaultCurrency &&
          prev.extCurrency === defaultCurrency
        ) {
          return prev
        }

        return withStationCurrency(prev, defaultCurrency)
      }),
    )
  }, [defaultCurrency])

  const handleClose = () => {
    setErrors({})
    setAdvancedOpen(false)
    onClose()
  }

  const validate = () => {
    const nextErrors: AddProductFormErrors = {}
    if (!form.extDescription.trim())
      nextErrors.productName = 'Product name is required'
    if (!form.extProductCode.trim())
      nextErrors.productCode = 'Product code is required'
    if (!form.extProductClassCode.trim())
      nextErrors.productClassCode = 'Product class code is required'
    if (!form.extProductTypeCode.trim())
      nextErrors.productTypeCode = 'Product type code is required'
    if (!form.extTaxCode.trim()) nextErrors.taxCode = 'Tax code is required'
    if (!form.extUnitPrice.trim() || Number.isNaN(Number(form.extUnitPrice)))
      nextErrors.unitPrice = 'Valid unit price is required'
    if (!form.unitCost.trim() || Number.isNaN(Number(form.unitCost)))
      nextErrors.unitCost = 'Valid unit cost is required'
    if (!form.extCurrency.trim()) nextErrors.currency = 'Currency is required'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)

    try {
      const payload = buildPayload(form)
      const result = await onSubmit({ csrfToken, payload, form })

      if (!result.ok) {
        const msg =
          result.body?.error?.message ??
          result.body?.message ??
          'Failed to save product'
        showToast('error', msg)
        return
      }

      const syncMsg =
        result.body?.data?.sync?.message ??
        result.body?.sync?.message ??
        'Saved'

      showToast(
        result.body?.data?.sync?.ok === false ? 'info' : 'success',
        syncMsg,
      )

      onSuccess?.({ body: result.body, payload })
      handleClose()
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to save product')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <SheetHeader className="px-6 pt-6">
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>

      <CsrfBootstrap onToken={setCsrfToken} />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <CsrfHiddenInput token={csrfToken} />

        {configError && (
          <div className="px-6 pt-4 text-xs text-red-600">{configError}</div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-4">
            <FormField label="Product name" error={errors.productName}>
              <Input
                value={form.extDescription}
                onChange={(event) =>
                  setForm((prev: any) => ({
                    ...prev,
                    extDescription: event.target.value,
                  }))
                }
                placeholder="Premium Diesel"
              />
            </FormField>
            <FormField label="Product code" error={errors.productCode}>
              <Input
                value={form.extProductCode}
                onChange={(event) =>
                  setForm((prev: any) => ({
                    ...prev,
                    extProductCode: event.target.value,
                  }))
                }
                placeholder="PRD-001"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                label="Product class code"
                error={errors.productClassCode}
              >
                <SearchableSelect
                  value={form.extProductClassCode}
                  onChange={(nextValue) =>
                    setForm((prev: any) => ({
                      ...prev,
                      extProductClassCode: nextValue,
                    }))
                  }
                  disabled={configLoading || !productClassOptions.length}
                  placeholder={
                    configLoading
                      ? 'Loading class codes...'
                      : productClassOptions.length
                        ? 'Select class code'
                        : 'No class codes available'
                  }
                  searchPlaceholder="Search class code, name, or description"
                  options={productClassOptions.map((option) => ({
                    value: option.code,
                    label: `${option.code} — ${option.name}`,
                    secondaryText: option.description,
                    searchText: `${option.code} ${option.name} ${option.description ?? ''}`,
                  }))}
                />
              </FormField>
              <FormField
                label="Product type code"
                error={errors.productTypeCode}
              >
                <Select
                  value={form.extProductTypeCode}
                  onChange={(event) =>
                    setForm((prev: any) => ({
                      ...prev,
                      extProductTypeCode: event.target.value,
                    }))
                  }
                  disabled={configLoading}
                >
                  <option value="">
                    {configLoading
                      ? 'Loading type codes...'
                      : productTypeOptions.length
                        ? 'Select type code'
                        : 'No type codes available'}
                  </option>
                  {productTypeOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} — {option.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Product ID">
              <Input
                value={form.extProductId}
                onChange={(event) =>
                  setForm((prev: any) => ({
                    ...prev,
                    extProductId: event.target.value,
                  }))
                }
                placeholder="PRD-001"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Unit price" error={errors.unitPrice}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.extUnitPrice}
                  onChange={(event) =>
                    setForm((prev: any) => ({
                      ...prev,
                      extUnitPrice: event.target.value,
                    }))
                  }
                  placeholder="183.00"
                />
              </FormField>
              <FormField label="Unit cost" error={errors.unitCost}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.unitCost}
                  onChange={(event) =>
                    setForm((prev: any) => ({
                      ...prev,
                      unitCost: event.target.value,
                    }))
                  }
                  placeholder="180.00"
                />
              </FormField>
            </div>
            <FormField
              label="Currency"
              error={errors.currency}
              helpText="Set automatically from the station country."
            >
              <Input value={defaultCurrency} readOnly disabled />
            </FormField>
            <FormField label="Tax code" error={errors.taxCode}>
              <Select
                value={form.extTaxCode}
                onChange={(event) => {
                  const selectedCode = event.target.value
                  const selectedOption = taxTypeOptions.find(
                    (option) => option.code === selectedCode,
                  )

                  setForm((prev: any) => ({
                    ...prev,
                    taxCode: selectedCode,
                    extTaxCode: selectedCode,
                    taxRate:
                      selectedOption?.rate != null
                        ? String(selectedOption.rate)
                        : prev.taxRate,
                  }))
                }}
                disabled={!taxTypeOptions.length}
              >
                <option value="">
                  {taxTypeOptions.length
                    ? 'Select tax code'
                    : 'No tax codes available'}
                </option>
                {taxTypeOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} — {option.name}
                    {option.rate != null ? ` (${option.rate}%)` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <details
            open={advancedOpen}
            onClick={(event) => {
              const target = event.target as HTMLElement
              if (target.tagName.toLowerCase() === 'summary') {
                event.preventDefault()
                setAdvancedOpen((prev) => !prev)
              }
            }}
            className="rounded-card border border-border bg-surface-card px-3 py-2"
          >
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">
              Advanced fields
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="SKU">
                  <Input
                    value={form.sku}
                    onChange={(event) =>
                      setForm((prev: any) => ({
                        ...prev,
                        sku: event.target.value,
                      }))
                    }
                    placeholder="SKU-001"
                  />
                </FormField>
                <FormField label="Barcode">
                  <Input
                    value={form.barcode}
                    onChange={(event) =>
                      setForm((prev: any) => ({
                        ...prev,
                        barcode: event.target.value,
                      }))
                    }
                    placeholder="123456789"
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label="Category"
                  helpText="Categories are managed from the Products header."
                >
                  <div className="space-y-2">
                    <SearchableSelect
                      value={form.categoryId}
                      onChange={(nextValue) => {
                        const selected = categoryOptions.find(
                          (option) => String(option.id ?? '') === nextValue,
                        )
                        setForm((prev: any) => ({
                          ...prev,
                          categoryId: nextValue,
                          category: selected?.name ?? '',
                        }))
                      }}
                      disabled={configLoading || !categoryOptions.length}
                      placeholder={
                        configLoading
                          ? 'Loading categories...'
                          : categoryOptions.length
                            ? 'Select category'
                            : 'No categories available'
                      }
                      searchPlaceholder="Search category"
                      options={categoryOptions.map((option) => ({
                        value: String(option.id ?? ''),
                        label: option.name,
                        secondaryText: option.description,
                        searchText:
                          `${option.code} ${option.name} ${option.description ?? ''} ${getCategoryIconLabel(option.icon)}`.trim(),
                      }))}
                      renderOption={(renderedOption) => {
                        const category = categoryOptions.find(
                          (option) =>
                            String(option.id ?? '') === renderedOption.value,
                        )
                        return (
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-muted">
                              <CategoryIconGlyph
                                icon={category?.icon}
                                className="h-4 w-4"
                                fallback="Package"
                              />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {renderedOption.label}
                              </div>
                              {renderedOption.secondaryText ? (
                                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                                  {renderedOption.secondaryText}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      }}
                      renderValue={(selectedOption) => {
                        const category = categoryOptions.find(
                          (option) =>
                            String(option.id ?? '') === selectedOption?.value,
                        )
                        return selectedOption ? (
                          <CategoryIconChip
                            icon={category?.icon}
                            label={selectedOption.label}
                            className="min-w-0"
                          />
                        ) : (
                          <span className="truncate">Select category</span>
                        )
                      }}
                    />
                    <Button
                      asChild
                      variant="secondary"
                      className="w-full sm:w-auto"
                    >
                      <Link
                        href="/admin/products/categories"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Manage categories
                      </Link>
                    </Button>
                  </div>
                </FormField>
                <FormField label="Unit of measure">
                  <Select
                    value={form.extUnitOfMeasure}
                    onChange={(event) =>
                      setForm((prev: any) => ({
                        ...prev,
                        extUnitOfMeasure: event.target.value,
                      }))
                    }
                    disabled={configLoading}
                  >
                    <option value="">
                      {configLoading
                        ? 'Loading units...'
                        : unitOptions.length
                          ? 'Select unit'
                          : 'No units available'}
                    </option>
                    {unitOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} — {option.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Pack size">
                  <Select
                    value={form.extUnitOfPackaging || form.unitOfPackaging}
                    onChange={(event) =>
                      setForm((prev) =>
                        withPackagingSelection(prev, event.target.value),
                      )
                    }
                    disabled={configLoading}
                  >
                    <option value="">
                      {configLoading
                        ? 'Loading pack sizes...'
                        : packSizeOptions.length
                          ? 'Select pack size'
                          : 'No pack sizes available'}
                    </option>
                    {packSizeOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} — {option.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Tax rate">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.taxRate}
                    onChange={(event) =>
                      setForm((prev: any) => ({
                        ...prev,
                        taxRate: event.target.value,
                      }))
                    }
                    placeholder="16"
                  />
                </FormField>
                <FormField label="Commodity code">
                  <Input
                    value={form.commodityCode}
                    onChange={(event) =>
                      setForm((prev: any) => ({
                        ...prev,
                        commodityCode: event.target.value,
                      }))
                    }
                    placeholder="001"
                  />
                </FormField>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="hazardousIndicator"
                  type="checkbox"
                  checked={form.extHazardousIndicator}
                  onChange={(event) =>
                    setForm((prev: any) => ({
                      ...prev,
                      hazardousIndicator: event.target.checked,
                      extHazardousIndicator: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-border"
                />
                <label
                  htmlFor="hazardousIndicator"
                  className="text-sm text-[var(--text-secondary)]"
                >
                  Hazardous indicator
                </label>
              </div>
              {isDevEnv && (
                <FormField label="Dev flow override">
                  <Select
                    value={form.devFlowOverride}
                    onChange={(event) =>
                      setForm((prev: any) => ({
                        ...prev,
                        devFlowOverride: event.target.value as any,
                      }))
                    }
                  >
                    <option value="">None</option>
                    <option value="offline">Offline</option>
                    <option value="timeout">Timeout</option>
                  </Select>
                </FormField>
              )}
            </div>
          </details>
        </div>
        <div className="border-t bg-[var(--surface-card)] px-6 py-4">
          <SheetFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : submitLabel}
            </Button>
          </SheetFooter>
        </div>
      </form>
    </>
  )
}
