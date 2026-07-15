'use client'

import type {
  PosCatalogCategory,
  PosCatalogProduct,
} from '@/src/modules/pos/contracts/catalog'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react'

import { formatNumber } from '@/src/shared/utils/format'

import { PageHeader } from '@/components/layout/page-header'
import { CategoryIconGlyph } from '@/components/products/category-icons'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'

type PosCategory = PosCatalogCategory
type PosProduct = PosCatalogProduct

type PosLine = {
  productId: string
  productCode?: string | null
  productName: string
  quantity: number
  unitPrice: number
  currency?: string | null
  categoryName?: string | null
}

const clampQty = (value: number) => {
  if (!Number.isFinite(value)) return 1
  if (value <= 0) return 0
  return Math.round(value * 1000) / 1000
}

const parseErrorMessage = (body: any, fallback: string) =>
  String(body?.error?.message || fallback)

export default function ProvisionalPosPageClient({
  products,
  categories,
  decimals,
  transactionsHref,
}: {
  products: PosProduct[]
  categories: PosCategory[]
  decimals: DecimalSettings
  transactionsHref: string
}) {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [pumpNumber, setPumpNumber] = useState('0')
  const [posReference, setPosReference] = useState('')
  const [lines, setLines] = useState<PosLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    transactionId: string
    totalAmount: number
    lineCount: number
  } | null>(null)

  const uncategorizedCount = useMemo(
    () => products.filter((product) => !product.categoryId).length,
    [products],
  )

  const visibleCategories = useMemo(() => {
    const base = categories.filter(
      (category) => (category.productCount ?? 0) > 0,
    )
    if (uncategorizedCount > 0) {
      return [
        ...base,
        {
          id: '__uncategorized__',
          code: 'UNCATEGORIZED',
          name: 'Uncategorized',
          icon: '🧾',
          productCount: uncategorizedCount,
        },
      ]
    }
    return base
  }, [categories, uncategorizedCount])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'ALL'
          ? true
          : selectedCategory === '__uncategorized__'
            ? !product.categoryId
            : product.categoryId === selectedCategory

      if (!matchesCategory) return false
      if (!term) return true

      const haystack = [
        product.productName,
        product.productCode,
        product.externalProductId,
        product.categoryName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [products, search, selectedCategory])

  const totalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  )

  const addProduct = (product: PosProduct) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: clampQty(line.quantity + 1) }
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
          categoryName: product.categoryName ?? null,
        },
      ]
    })
    setSuccess(null)
  }

  const updateQuantity = (productId: string, nextValue: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: clampQty(nextValue) }
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

  const handleSubmit = async () => {
    setError(null)
    if (!lines.length) {
      setError('Add at least one item before completing the sale.')
      return
    }

    const parsedPump = Number(pumpNumber)
    if (!Number.isFinite(parsedPump) || parsedPump < 0) {
      setError('Pump number must be zero or a positive number.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          pumpNumber: parsedPump,
          posReference: posReference.trim(),
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        throw new Error(parseErrorMessage(body, 'Could not complete the sale.'))
      }
      const data = body?.data ?? body
      setSuccess({
        transactionId: String(data?.transactionId ?? ''),
        totalAmount: Number(data?.totalAmount ?? 0),
        lineCount: Number(data?.lineCount ?? 0),
      })
      setLines([])
      setPosReference('')
      setPumpNumber('0')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setError(String(err?.message || 'Could not complete the sale.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title="POS"
        description="Provisional point-of-sale flow using product categories for faster catalog browsing."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href={transactionsHref}>Transactions</Link>
            </Button>
          </div>
        }
      />

      {success ? (
        <Card className="p-4 text-sm text-[var(--text-secondary)]">
          <div className="font-medium text-[var(--text-primary)]">
            Sale captured
          </div>
          <div className="mt-1">
            Transaction{' '}
            <span className="font-mono">{success.transactionId}</span> now has{' '}
            {success.lineCount} item{success.lineCount === 1 ? '' : 's'}.
          </div>
          <div className="mt-1">
            Total amount: {success.totalAmount.toFixed(2)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push(transactionsHref)}
            >
              Open transactions
            </Button>
            <Button variant="primary" onClick={() => setSuccess(null)}>
              Start next sale
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr,0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <CardTitle>Catalog</CardTitle>
                <CardDescription>
                  Filter products by category, then tap an item to add it to the
                  current sale.
                </CardDescription>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products"
                  className="pl-9"
                />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={
                    'flex min-w-[140px] shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ' +
                    (selectedCategory === 'ALL'
                      ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--brand-primary)]'
                      : 'border-border bg-[var(--surface-card)] hover:-translate-y-0.5 hover:shadow-sm')
                  }
                >
                  <div className="border-current/20 bg-current/10 flex h-12 w-12 items-center justify-center rounded-2xl border text-lg">
                    🛍️
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      All products
                    </div>
                    <div className="text-xs opacity-80">
                      {products.length} items
                    </div>
                  </div>
                </button>
                {visibleCategories.map((category) => {
                  const active = selectedCategory === category.id
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      className={
                        'flex min-w-[160px] shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ' +
                        (active
                          ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--brand-primary)]'
                          : 'border-border bg-[var(--surface-card)] hover:-translate-y-0.5 hover:shadow-sm')
                      }
                    >
                      <div className="border-current/20 bg-current/10 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border text-lg">
                        {category.imagePath ? (
                          <img
                            src={category.imagePath}
                            alt={category.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <CategoryIconGlyph
                            icon={category.icon}
                            fallback="ReceiptText"
                            className="h-5 w-5"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {category.name}
                        </div>
                        <div className="text-xs opacity-80">
                          {category.productCount ?? 0} items
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className="rounded-2xl border border-border bg-[var(--surface-card)] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-muted text-lg">
                    {product.categoryImagePath ? (
                      <img
                        src={product.categoryImagePath}
                        alt={product.categoryName || product.productName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CategoryIconGlyph
                        icon={product.categoryIcon}
                        fallback="ReceiptText"
                        className="h-5 w-5"
                      />
                    )}
                  </div>
                  <div className="rounded-full border border-border px-2 py-1 text-xs text-[var(--text-muted)]">
                    {product.categoryName || 'Uncategorized'}
                  </div>
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {product.productName}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {[product.productCode, product.externalProductId]
                    .filter(Boolean)
                    .join(' • ') || 'Manual catalog item'}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-[var(--text-primary)]">
                      {formatMoney(Number(product.unitPrice ?? 0))}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {product.unitOfMeasure ||
                        product.currency ||
                        'Unit price'}
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-[var(--surface-card)] text-[var(--text-secondary)]">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState
              title="No matching products"
              description="Try a different search term or choose another category."
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <CardTitle>Current sale</CardTitle>
                <CardDescription>
                  Adjust quantities and complete the sale when ready.
                </CardDescription>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    POS reference
                  </div>
                  <Input
                    value={posReference}
                    onChange={(event) => setPosReference(event.target.value)}
                    placeholder="Optional operator reference"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              {lines.length === 0 ? (
                <EmptyState
                  title="No items added"
                  description="Choose a product from the catalog to begin the sale."
                />
              ) : (
                <div className="space-y-3">
                  {lines.map((line) => (
                    <div
                      key={line.productId}
                      className="rounded-2xl border border-border bg-[var(--surface-card)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {line.productName}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {[line.productCode, line.categoryName]
                              .filter(Boolean)
                              .join(' • ')}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => removeLine(line.productId)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              updateQuantity(line.productId, line.quantity - 1)
                            }
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <div className="min-w-[64px] rounded-xl border border-border px-3 py-2 text-center text-sm font-medium text-[var(--text-primary)]">
                            {formatQty(line.quantity)}
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              updateQuantity(line.productId, line.quantity + 1)
                            }
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-[var(--text-muted)]">
                            Line total
                          </div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            {formatMoney(line.quantity * line.unitPrice)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
                <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
                  <span>Items</span>
                  <span>{lines.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-base font-semibold text-[var(--text-primary)]">
                  <span>Total</span>
                  <span>{formatMoney(totalAmount)}</span>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <Button
                type="button"
                variant="primary"
                className="w-full"
                disabled={submitting || !csrfToken}
                onClick={handleSubmit}
              >
                {submitting ? 'Completing sale…' : 'Complete sale'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
