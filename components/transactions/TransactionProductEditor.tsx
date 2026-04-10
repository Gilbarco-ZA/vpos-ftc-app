'use client'

import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react'

import { formatNumber } from '@/src/shared/utils/format'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type TransactionBuilderProduct = {
  id: string
  externalProductId?: string | null
  productCode?: string | null
  productName: string
  unitPrice: number
  currency?: string | null
  unitOfMeasure?: string | null
  categoryId?: string | null
  categoryName?: string | null
}

export type TransactionBuilderLine = {
  productId: string
  productCode?: string | null
  productName: string
  quantity: number
  unitPrice: number
  currency?: string | null
}

export type TransactionFuelSelection = {
  tankId?: string | null
  nozzleId?: string | null
  nozzleNumber?: number | null
  gradeId?: string | null
  gradeName?: string | null
  pumpId?: string | null
}

export type TransactionFuelSelectionOption = {
  pumpId?: string | null
  pumpNumber?: number | null
  nozzleId?: string | null
  nozzleNumber?: number | null
  tankId?: string | null
  tankName?: string | null
  productRowId?: string | null
  gradeId?: string | null
  gradeName?: string | null
  productCode?: string | null
}

export type TransactionBuilderSubmitPayload = {
  pumpNumber: number
  posReference: string
  removedProductIds: string[]
  lines: Array<{
    productId: string
    quantity: number
    unitPrice: number
  }>
  fuelSelection?: TransactionFuelSelection | null
}

type TransactionProductEditorProps = {
  products: TransactionBuilderProduct[]
  initialLines?: TransactionBuilderLine[]
  initialFuelSelection?: TransactionFuelSelection | null
  decimals: DecimalSettings
  onSubmit: (payload: TransactionBuilderSubmitPayload) => Promise<void>
  submitLabel: string
  submitBusyLabel?: string
  showTransactionFields?: boolean
  initialPumpNumber?: number
  initialPosReference?: string
  resetKey?: string | number
  catalogDisplay?: 'inline' | 'picker'
  allowFuelSelectionEditing?: boolean
}

const FUEL_PRODUCT_PATTERN =
  /(fuel|petrol|diesel|gasoline|gasolina|kerosene|super|unleaded|octane|lpg|cng|ago|pms)/i
const EMPTY_INITIAL_LINES: TransactionBuilderLine[] = []

const clampQty = (value: number) => {
  if (!Number.isFinite(value)) return 1
  if (value <= 0) return 0
  return Math.round(value * 1000) / 1000
}

const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

const isFuelLikeProduct = (product: TransactionBuilderProduct | undefined) => {
  if (!product) return false

  const category = String(product.categoryName || '')
    .trim()
    .toUpperCase()
  if (category === 'FUEL') {
    return true
  }

  return FUEL_PRODUCT_PATTERN.test(
    [product.productName, product.productCode, product.categoryName]
      .filter(Boolean)
      .join(' '),
  )
}

const uniqueBy = <T,>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = getKey(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const emptyFuelSelection = (): TransactionFuelSelection => ({
  tankId: null,
  nozzleId: null,
  nozzleNumber: null,
  gradeId: null,
  gradeName: null,
  pumpId: null,
})

export default function TransactionProductEditor({
  products,
  initialLines = EMPTY_INITIAL_LINES,
  initialFuelSelection = null,
  decimals,
  onSubmit,
  submitLabel,
  submitBusyLabel,
  showTransactionFields = false,
  initialPumpNumber = 0,
  initialPosReference = '',
  resetKey,
  catalogDisplay = 'inline',
  allowFuelSelectionEditing = true,
}: TransactionProductEditorProps) {
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<TransactionBuilderLine[]>(initialLines)
  const [pumpNumber, setPumpNumber] = useState(String(initialPumpNumber))
  const [posReference, setPosReference] = useState(initialPosReference)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fuelOptions, setFuelOptions] = useState<
    TransactionFuelSelectionOption[]
  >([])
  const [fuelSelection, setFuelSelection] = useState<TransactionFuelSelection>(
    initialFuelSelection ?? emptyFuelSelection(),
  )
  const [fuelOptionsLoading, setFuelOptionsLoading] = useState(false)
  const [fuelOptionsError, setFuelOptionsError] = useState<string | null>(null)

  useEffect(() => {
    setLines(initialLines)
  }, [initialLines])

  useEffect(() => {
    setFuelSelection(initialFuelSelection ?? emptyFuelSelection())
  }, [initialFuelSelection])

  useEffect(() => {
    setPumpNumber(String(initialPumpNumber))
    setPosReference(initialPosReference)
    setSearch('')
    setError(null)
    setSubmitting(false)
    setPickerOpen(false)
    setLines(initialLines)
    setFuelSelection(initialFuelSelection ?? emptyFuelSelection())
  }, [
    initialPumpNumber,
    initialPosReference,
    initialLines,
    initialFuelSelection,
    resetKey,
  ])

  useEffect(() => {
    let ignore = false

    const loadFuelOptions = async () => {
      setFuelOptionsLoading(true)
      setFuelOptionsError(null)
      try {
        const res = await fetch('/api/transactions/fuel-options', {
          cache: 'no-store',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.ok === false) {
          throw new Error(
            String(
              body?.error?.message || 'Failed to load forecourt fuel options.',
            ),
          )
        }
        if (ignore) return
        setFuelOptions(
          Array.isArray(body?.data?.options) ? body.data.options : [],
        )
      } catch (err: any) {
        if (ignore) return
        setFuelOptionsError(
          String(err?.message || 'Failed to load forecourt fuel options.'),
        )
      } finally {
        if (!ignore) {
          setFuelOptionsLoading(false)
        }
      }
    }

    loadFuelOptions()
    return () => {
      ignore = true
    }
  }, [])

  const searchTerm = search.trim().toLowerCase()
  const shouldShowCatalogResults =
    catalogDisplay === 'inline' ? true : searchTerm.length > 0

  const filteredProducts = useMemo(() => {
    if (!shouldShowCatalogResults) return []
    return products
      .filter((product) => {
        if (!searchTerm) return true
        const haystack = [
          product.productName,
          product.productCode,
          product.externalProductId,
          product.categoryName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(searchTerm)
      })
      .slice(0, 16)
  }, [products, searchTerm, shouldShowCatalogResults])

  const totalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  )

  const productById = useMemo(
    () =>
      new Map(
        products.map((product) => [String(product.id), product] as const),
      ),
    [products],
  )

  const fuelProductIds = useMemo(
    () =>
      lines
        .map((line) => String(line.productId))
        .filter((productId) => isFuelLikeProduct(productById.get(productId))),
    [lines, productById],
  )
  const hasFuelLine = fuelProductIds.length > 0
  const shouldShowFuelDetails = hasFuelLine && allowFuelSelectionEditing

  const relevantFuelOptions = useMemo(() => {
    const filtered = fuelOptions.filter((option) => {
      if (!option?.nozzleId || !option?.tankId) return false
      if (fuelProductIds.length === 0) return true
      const productRowId = String(option.productRowId || '').trim()
      return !productRowId || fuelProductIds.includes(productRowId)
    })

    return filtered.length > 0 ? filtered : fuelOptions
  }, [fuelOptions, fuelProductIds])

  const gradeOptions = useMemo(
    () =>
      uniqueBy(relevantFuelOptions, (option) =>
        String(option.gradeId || option.gradeName || ''),
      ),
    [relevantFuelOptions],
  )

  const nozzleOptions = useMemo(() => {
    const gradeId = cleanText(fuelSelection.gradeId)
    return uniqueBy(
      relevantFuelOptions.filter((option) => {
        if (!gradeId) return true
        return String(option.gradeId || '') === gradeId
      }),
      (option) => String(option.nozzleId || ''),
    )
  }, [relevantFuelOptions, fuelSelection.gradeId])

  const tankOptions = useMemo(() => {
    const gradeId = cleanText(fuelSelection.gradeId)
    const nozzleId = cleanText(fuelSelection.nozzleId)
    return uniqueBy(
      relevantFuelOptions.filter((option) => {
        if (gradeId && String(option.gradeId || '') !== gradeId) return false
        if (nozzleId && String(option.nozzleId || '') !== nozzleId) return false
        return true
      }),
      (option) => String(option.tankId || ''),
    )
  }, [relevantFuelOptions, fuelSelection.gradeId, fuelSelection.nozzleId])

  const selectedFuelOption = useMemo(() => {
    const gradeId = cleanText(fuelSelection.gradeId)
    const nozzleId = cleanText(fuelSelection.nozzleId)
    const tankId = cleanText(fuelSelection.tankId)

    return (
      relevantFuelOptions.find((option) => {
        if (gradeId && String(option.gradeId || '') !== gradeId) return false
        if (nozzleId && String(option.nozzleId || '') !== nozzleId) return false
        if (tankId && String(option.tankId || '') !== tankId) return false
        return Boolean(option.nozzleId && option.tankId)
      }) ?? null
    )
  }, [relevantFuelOptions, fuelSelection])

  useEffect(() => {
    if (!hasFuelLine) {
      setFuelSelection(emptyFuelSelection())
      return
    }

    if (!shouldShowFuelDetails) {
      return
    }

    const gradeId = cleanText(fuelSelection.gradeId)
    const nozzleId = cleanText(fuelSelection.nozzleId)
    const tankId = cleanText(fuelSelection.tankId)

    const gradeValid =
      !gradeId ||
      gradeOptions.some((option) => String(option.gradeId || '') === gradeId)
    const nozzleValid =
      !nozzleId ||
      nozzleOptions.some((option) => String(option.nozzleId || '') === nozzleId)
    const tankValid =
      !tankId ||
      tankOptions.some((option) => String(option.tankId || '') === tankId)

    if (gradeValid && nozzleValid && tankValid) {
      return
    }

    setFuelSelection((current) => ({
      ...current,
      gradeId: gradeValid ? current.gradeId : null,
      gradeName: gradeValid ? current.gradeName : null,
      nozzleId: nozzleValid ? current.nozzleId : null,
      nozzleNumber: nozzleValid ? current.nozzleNumber : null,
      tankId: tankValid ? current.tankId : null,
      pumpId: nozzleValid ? current.pumpId : null,
    }))
  }, [
    hasFuelLine,
    fuelSelection.gradeId,
    fuelSelection.nozzleId,
    fuelSelection.tankId,
    gradeOptions,
    nozzleOptions,
    tankOptions,
    shouldShowFuelDetails,
  ])

  const addProduct = (product: TransactionBuilderProduct) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                quantity: clampQty(line.quantity + 1),
              }
            : line,
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          productCode: product.productCode ?? null,
          productName: product.productName,
          quantity: 1,
          unitPrice: Number(product.unitPrice ?? 0),
          currency: product.currency ?? null,
        },
      ]
    })

    if (catalogDisplay === 'picker') {
      setSearch('')
      setPickerOpen(false)
    }
  }

  const updateQuantity = (productId: string, nextValue: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? {
                ...line,
                quantity: clampQty(nextValue),
              }
            : line,
        )
        .filter((line) => line.quantity > 0),
    )
  }

  const removeLine = (productId: string) => {
    setLines((current) =>
      current.filter((line) => line.productId !== productId),
    )
  }

  const formatMoney = (value: number) => formatNumber(value, decimals.money)
  const formatQty = (value: number) => formatNumber(value, decimals.volume)

  const renderCatalogContent = () => (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products"
          className="pl-9"
        />
      </div>
      <div className="grid gap-2">
        {!shouldShowCatalogResults ? (
          <EmptyState
            title="Search for a product"
            description="Type a product name, code, or external product ID to find an item to add."
            className="min-h-[180px]"
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title="No products found"
            description="Try a different search term."
            className="min-h-[180px]"
          />
        ) : (
          filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="flex items-center justify-between rounded-2xl border border-border bg-[var(--surface-card)] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {product.productName}
                </div>
                <div className="truncate text-xs text-[var(--text-muted)]">
                  {[product.productCode, product.externalProductId]
                    .filter(Boolean)
                    .join(' • ') || 'Manual catalog item'}
                </div>
              </div>
              <div className="ml-3 flex items-center gap-3">
                <div className="text-right text-sm font-medium text-[var(--text-primary)]">
                  {formatMoney(Number(product.unitPrice ?? 0))}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-[var(--surface-card)] text-[var(--text-secondary)]">
                  <Plus className="h-full w-full" aria-hidden="true" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  const handleFuelGradeChange = (nextGradeId: string) => {
    const option = gradeOptions.find(
      (item) => String(item.gradeId || '') === nextGradeId,
    )
    setFuelSelection((current) => ({
      ...current,
      gradeId: nextGradeId || null,
      gradeName: option?.gradeName ?? null,
      tankId:
        option &&
        current.tankId &&
        String(option.tankId || '') === current.tankId
          ? current.tankId
          : null,
      nozzleId:
        option &&
        current.nozzleId &&
        String(option.nozzleId || '') === current.nozzleId
          ? current.nozzleId
          : null,
      nozzleNumber:
        option &&
        current.nozzleId &&
        String(option.nozzleId || '') === current.nozzleId
          ? current.nozzleNumber
          : null,
      pumpId:
        option &&
        current.nozzleId &&
        String(option.nozzleId || '') === current.nozzleId
          ? current.pumpId
          : null,
    }))
  }

  const handleFuelNozzleChange = (nextNozzleId: string) => {
    const option = relevantFuelOptions.find(
      (item) => String(item.nozzleId || '') === nextNozzleId,
    )
    setFuelSelection((current) => ({
      ...current,
      nozzleId: nextNozzleId || null,
      nozzleNumber: option?.nozzleNumber ?? null,
      pumpId: option?.pumpId ?? null,
      tankId: option?.tankId ?? current.tankId ?? null,
      gradeId: option?.gradeId ?? current.gradeId ?? null,
      gradeName: option?.gradeName ?? current.gradeName ?? null,
    }))
  }

  const handleFuelTankChange = (nextTankId: string) => {
    const option = relevantFuelOptions.find(
      (item) => String(item.tankId || '') === nextTankId,
    )
    setFuelSelection((current) => ({
      ...current,
      tankId: nextTankId || null,
      nozzleId: option?.nozzleId ?? current.nozzleId ?? null,
      nozzleNumber: option?.nozzleNumber ?? current.nozzleNumber ?? null,
      pumpId: option?.pumpId ?? current.pumpId ?? null,
      gradeId: option?.gradeId ?? current.gradeId ?? null,
      gradeName: option?.gradeName ?? current.gradeName ?? null,
    }))
  }

  const handleSubmit = async () => {
    setError(null)
    if (lines.length === 0) {
      setError('Add at least one product before saving the transaction.')
      return
    }

    if (showTransactionFields) {
      const parsedPump = Number(pumpNumber)
      if (!Number.isFinite(parsedPump) || parsedPump < 0) {
        setError('Pump number must be zero or a positive number.')
        return
      }
    }

    let nextFuelSelection: TransactionFuelSelection | null = null
    if (shouldShowFuelDetails) {
      if (fuelOptionsLoading) {
        setError('Fuel options are still loading. Please wait and try again.')
        return
      }
      if (relevantFuelOptions.length === 0) {
        setError(
          fuelOptionsError ||
            'No forecourt tank/nozzle mappings are available for the selected fuel item.',
        )
        return
      }

      const gradeId = cleanText(fuelSelection.gradeId)
      const nozzleId = cleanText(fuelSelection.nozzleId)
      const tankId = cleanText(fuelSelection.tankId)
      if (!gradeId || !nozzleId || !tankId) {
        setError(
          'Fuel transactions require Grade, Nozzle, and Tank before you can continue.',
        )
        return
      }

      const matchedOption =
        relevantFuelOptions.find(
          (option) =>
            String(option.gradeId || '') === gradeId &&
            String(option.nozzleId || '') === nozzleId &&
            String(option.tankId || '') === tankId,
        ) ??
        relevantFuelOptions.find(
          (option) =>
            String(option.nozzleId || '') === nozzleId &&
            String(option.tankId || '') === tankId,
        ) ??
        null

      nextFuelSelection = {
        tankId,
        nozzleId,
        nozzleNumber:
          matchedOption?.nozzleNumber ?? fuelSelection.nozzleNumber ?? null,
        gradeId,
        gradeName:
          matchedOption?.gradeName ??
          cleanText(fuelSelection.gradeName) ??
          null,
        pumpId:
          matchedOption?.pumpId ?? cleanText(fuelSelection.pumpId) ?? null,
      }
    }

    setSubmitting(true)
    try {
      const currentProductIds = new Set(lines.map((line) => line.productId))
      await onSubmit({
        pumpNumber: Number(pumpNumber || 0),
        posReference: posReference.trim(),
        removedProductIds: initialLines
          .map((line) => line.productId)
          .filter((productId) => !currentProductIds.has(productId)),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        fuelSelection: nextFuelSelection,
      })
    } catch (err: any) {
      setError(String(err?.message || 'Could not save transaction lines.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {showTransactionFields ? (
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Pump number
              </div>
              <Input
                type="number"
                min="0"
                step="1"
                value={pumpNumber}
                onChange={(event) => setPumpNumber(event.target.value)}
                placeholder="0 for manual sale"
              />
              <div className="text-xs text-[var(--text-muted)]">
                Use 0 when the transaction is not tied to a forecourt pump.
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                POS reference
              </div>
              <Input
                value={posReference}
                onChange={(event) => setPosReference(event.target.value)}
                placeholder="Optional reference for the operator"
              />
              <div className="text-xs text-[var(--text-muted)]">
                This helps operators find the transaction later.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {shouldShowFuelDetails ? (
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <CardTitle>Fuel details</CardTitle>
              <CardDescription>
                Fuel items require a mapped Grade, Nozzle, and Tank before the
                transaction can be saved or sent for fiscalization.
              </CardDescription>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  Grade
                </div>
                <Select
                  value={String(fuelSelection.gradeId || '')}
                  onChange={(event) =>
                    handleFuelGradeChange(event.target.value)
                  }
                >
                  <option value="">Select grade</option>
                  {gradeOptions.map((option) => (
                    <option
                      key={String(
                        option.gradeId ||
                          option.gradeName ||
                          option.productCode,
                      )}
                      value={String(option.gradeId || '')}
                    >
                      {option.gradeName || option.productCode || 'Fuel grade'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  Nozzle
                </div>
                <Select
                  value={String(fuelSelection.nozzleId || '')}
                  onChange={(event) =>
                    handleFuelNozzleChange(event.target.value)
                  }
                >
                  <option value="">Select nozzle</option>
                  {nozzleOptions.map((option) => (
                    <option
                      key={String(option.nozzleId || '')}
                      value={String(option.nozzleId || '')}
                    >
                      Pump {option.pumpNumber ?? '-'} • Nozzle{' '}
                      {option.nozzleNumber ?? '-'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  Tank
                </div>
                <Select
                  value={String(fuelSelection.tankId || '')}
                  onChange={(event) => handleFuelTankChange(event.target.value)}
                >
                  <option value="">Select tank</option>
                  {tankOptions.map((option) => (
                    <option
                      key={String(option.tankId || '')}
                      value={String(option.tankId || '')}
                    >
                      {option.tankName || option.tankId || 'Tank'}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {fuelOptionsLoading
                ? 'Loading forecourt mappings…'
                : fuelOptionsError
                  ? fuelOptionsError
                  : selectedFuelOption
                    ? `Resolved to Pump ${selectedFuelOption.pumpNumber ?? '-'} / Nozzle ${selectedFuelOption.nozzleNumber ?? '-'} / ${selectedFuelOption.tankName || 'Tank'}`
                    : 'Select the forecourt mapping that matches the fuel portion of this transaction.'}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div
        className={
          catalogDisplay === 'inline'
            ? 'grid gap-4 xl:grid-cols-[1.1fr,1.4fr]'
            : 'grid gap-4'
        }
      >
        {catalogDisplay === 'inline' ? (
          <Card className="overflow-hidden">
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <CardTitle>Product catalog</CardTitle>
                <CardDescription>
                  Search by product name, code, or external product ID, then add
                  items to the transaction.
                </CardDescription>
              </div>
              {renderCatalogContent()}
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Transaction items</CardTitle>
                <CardDescription>
                  Adjust quantities here. Totals update immediately before you
                  save.
                </CardDescription>
              </div>
              {catalogDisplay === 'picker' ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:self-start"
                  onClick={() => setPickerOpen(true)}
                >
                  <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add product
                </Button>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <EmptyState
                title="No items added"
                description="Select products from the catalog to start building the transaction."
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit price</TableHead>
                      <TableHead>Line total</TableHead>
                      <TableHead className="text-right">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.productId}>
                        <TableCell>
                          <div className="font-medium text-[var(--text-primary)]">
                            {line.productName}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {line.productCode || 'No code'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-full px-0"
                              onClick={() =>
                                updateQuantity(
                                  line.productId,
                                  line.quantity - 1,
                                )
                              }
                            >
                              <Minus aria-hidden="true" />
                            </Button>
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={String(line.quantity)}
                              onChange={(event) =>
                                updateQuantity(
                                  line.productId,
                                  Number(event.target.value || 0),
                                )
                              }
                              className="h-9 w-24"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-full px-0"
                              onClick={() =>
                                updateQuantity(
                                  line.productId,
                                  line.quantity + 1,
                                )
                              }
                            >
                              <Plus aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-[var(--text-secondary)]">
                          {formatMoney(line.unitPrice)}
                        </TableCell>
                        <TableCell className="font-medium text-[var(--text-primary)]">
                          {formatMoney(line.quantity * line.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(line.productId)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-surface-card px-4 py-4">
              <div className="grid gap-2 text-sm md:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Item count
                  </div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {lines.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Total quantity
                  </div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {formatQty(
                      lines.reduce((sum, line) => sum + line.quantity, 0),
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Total amount
                  </div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">
                    {formatMoney(totalAmount)}
                  </div>
                </div>
              </div>
            </div>

            {catalogDisplay === 'picker' ? (
              <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
                <SheetContent
                  side="right"
                  className="w-full max-w-md overflow-y-auto"
                >
                  <SheetHeader>
                    <SheetTitle>Add product</SheetTitle>
                    <SheetDescription>
                      Search for a product by name, code, or external product
                      ID.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4">{renderCatalogContent()}</div>
                </SheetContent>
              </Sheet>
            ) : null}

            {error ? <div className="text-sm text-red-600">{error}</div> : null}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? submitBusyLabel || 'Saving…' : submitLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
