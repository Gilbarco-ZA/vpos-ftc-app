'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import PssConfigurationVerification from '@/components/setup/PssConfigurationVerification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

type ProductItem = {
  id: string
  productId: string
  productName: string
  productCode?: string
}

type EntryRow = {
  id: string
  productId: string
  price: string
}

type PendingPriceSet = {
  fcPriceSetId: string
  activationAt: string
  source?: string
  confirmedOnDoms?: boolean
  status?: string
  lastEventType?: string | null
  lastEventAt?: string | null
  data?: any
}

type PriceSetResponseData = {
  pending?: PendingPriceSet[]
  status?: any
  current?: any
  currentError?: string
  warnings?: string[]
  capabilities?: {
    supportsPendingQueue?: boolean
    priceSetStatusSubCode?: string
    currentPriceSetSubCode?: string
    pendingPriceSetSubCode?: string
    changePriceSetSubCode?: string
  }
}

type ApplyMode = 'now' | 'scheduled'

function makeRow(): EntryRow {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId: '',
    price: '',
  }
}

function formatActivationAt(value?: string | null) {
  if (!value) return '—'
  const trimmed = String(value).trim()
  if (!/^\d{14}$/.test(trimmed)) return trimmed
  const iso = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T${trimmed.slice(8, 10)}:${trimmed.slice(10, 12)}:${trimmed.slice(12, 14)}`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return trimmed
  return date.toLocaleString()
}

function describePendingStatus(
  item: PendingPriceSet,
  supportsPendingQueue: boolean,
) {
  const status = String(item.status ?? '').trim()
  if (status === 'confirmed_on_doms' || item.confirmedOnDoms) {
    return {
      label: 'Pending on DOMS',
      detail: 'Confirmed by controller',
      variant: STATUS_VARIANT.INFO,
    }
  }
  if (status === 'verification_unavailable') {
    return {
      label: 'Awaiting activation',
      detail:
        'Controller accepted the update, but this controller does not expose the pending queue for verification.',
      variant: STATUS_VARIANT.WARN,
    }
  }
  if (supportsPendingQueue) {
    return {
      label: 'Pending (local)',
      detail: 'Submitted locally pending controller confirmation',
      variant: STATUS_VARIANT.WARN,
    }
  }
  return {
    label: 'Local record only',
    detail:
      'Recorded locally because this controller does not expose the pending queue',
    variant: STATUS_VARIANT.WARN,
  }
}

function getCurrentPriceBank(data?: PriceSetResponseData | null) {
  const currentData =
    data?.current?.data ?? data?.current?.payload?.data ?? null
  if (!currentData) return null
  return {
    fcPriceSetId: currentData.FcPriceSetId ?? currentData.fcPriceSetId ?? '—',
    fcPriceGroupIds: Array.isArray(currentData.FcPriceGroupId)
      ? currentData.FcPriceGroupId
      : Array.isArray(currentData.fcPriceGroupIds)
        ? currentData.fcPriceGroupIds
        : [],
    fcGradeIds: Array.isArray(currentData.FcGradeId)
      ? currentData.FcGradeId
      : Array.isArray(currentData.fcGradeIds)
        ? currentData.fcGradeIds
        : [],
    fcPriceGroups: Array.isArray(currentData.FcPriceGroups)
      ? currentData.FcPriceGroups
      : Array.isArray(currentData.fcPriceGroups)
        ? currentData.fcPriceGroups
        : [],
  }
}

export default function ForecourtPricingClient() {
  const [products, setProducts] = useState<ProductItem[]>([])
  const [rows, setRows] = useState<EntryRow[]>([makeRow()])
  const [applyMode, setApplyMode] = useState<ApplyMode>('now')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [priceStateError, setPriceStateError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [priceState, setPriceState] = useState<PriceSetResponseData | null>(
    null,
  )

  const loadProducts = useCallback(async () => {
    const res = await fetch('/api/products', { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.ok === false || body?.success === false) {
      throw new Error(
        body?.error?.message ?? body?.message ?? 'Unable to load products',
      )
    }
    const list = Array.isArray(body?.data) ? body.data : []
    setProducts(
      list.map((item: any) => ({
        id: String(item.id ?? item.productId ?? ''),
        productId: String(item.productId ?? item.id ?? ''),
        productName: String(
          item.productName ?? item.name ?? item.productId ?? '',
        ),
        productCode: item.productCode ? String(item.productCode) : undefined,
      })),
    )
  }, [])

  const refreshPriceState = useCallback(async () => {
    setIsRefreshing(true)
    setPriceStateError(null)
    try {
      const res = await fetch('/api/pos/doms/getGradePrices', {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.success === false) {
        throw new Error(
          body?.error?.message ??
            body?.message ??
            'Unable to load DOMS price state',
        )
      }
      setPriceState((body?.data ?? null) as PriceSetResponseData | null)
    } catch (err) {
      setPriceState(null)
      setPriceStateError(
        err instanceof Error ? err.message : 'Unable to load DOMS price state',
      )
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const loadInitial = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await Promise.all([loadProducts(), refreshPriceState()])
    } catch (err) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [loadProducts, refreshPriceState])

  useEffect(() => {
    queueMicrotask(() => {
      loadInitial()
    })
  }, [loadInitial])

  const updateRow = useCallback((id: string, patch: Partial<EntryRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((row) => row.id !== id),
    )
  }, [])

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, makeRow()])
  }, [])

  const pending = useMemo(() => priceState?.pending ?? [], [priceState])
  const currentBank = useMemo(
    () => getCurrentPriceBank(priceState),
    [priceState],
  )
  const warnings = useMemo(() => priceState?.warnings ?? [], [priceState])
  const supportsPendingQueue =
    priceState?.capabilities?.supportsPendingQueue !== false
  const hasPendingEntries = pending.length > 0
  const canSubmit = useMemo(() => {
    if (applyMode === 'scheduled' && !effectiveAt) return false
    return rows.some((row) => row.productId && row.price.trim())
  }, [applyMode, effectiveAt, rows])

  const handleSubmit = useCallback(async () => {
    setSubmitError(null)
    setSubmitMessage(null)

    const entries = rows
      .filter((row) => row.productId && row.price.trim())
      .map((row) => ({
        productId: row.productId,
        price: row.price.trim(),
      }))

    if (!entries.length) {
      setSubmitError('Provide at least one product price.')
      return
    }
    if (applyMode === 'scheduled' && !effectiveAt) {
      setSubmitError('Select an effective date and time for the scheduled update.')
      return
    }

    setIsSubmitting(true)
    try {
      const applyNow = applyMode === 'now'
      const res = await fetch('/api/pos/doms/changeGradePrices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          applyNow,
          ...(applyNow ? {} : { effectiveAt }),
          entries,
          replaceExistingAtSameActivation: !applyNow,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.success === false) {
        throw new Error(
          body?.error?.message ?? body?.message ?? 'Failed to update DOMS prices',
        )
      }

      const data = body?.data ?? {}
      const submitWarnings = Array.isArray(data?.warnings)
        ? data.warnings.filter(Boolean)
        : []
      let baseMessage: string

      if (data?.applyNow) {
        baseMessage = data?.verifiedOnController
          ? 'Price update is active on DOMS and the active price bank was verified.'
          : 'DOMS accepted the immediate price update, but the active price bank could not be verified yet.'
      } else if (data?.scheduled) {
        baseMessage = `Queued on DOMS for ${formatActivationAt(data.scheduled.activationAt)}`
      } else if (data?.controllerAccepted) {
        baseMessage = `DOMS accepted the scheduled update for ${formatActivationAt(data?.activationAt)}.`
      } else {
        baseMessage = 'Price update sent to DOMS.'
      }

      setSubmitMessage(
        submitWarnings.length > 0
          ? `${baseMessage} ${submitWarnings.join(' ')}`
          : baseMessage,
      )
      await refreshPriceState()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to update DOMS prices',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [applyMode, effectiveAt, refreshPriceState, rows])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Forecourt Pricing"
        description="Apply DOMS price changes immediately or schedule a future activation. Price changes are submitted as a complete DOMS price bank."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/setup/forecourt">Back to forecourt setup</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={loadInitial}
              disabled={isLoading || isRefreshing}
            >
              Refresh
            </Button>
          </>
        }
      />

      <PssConfigurationVerification compact />
      {isLoading ? (
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ) : error ? (
        <ErrorDetails
          title="Unable to load forecourt pricing"
          message="Check DOMS connectivity and product setup, then retry."
          error={error}
        />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    DOMS price bank status
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Review the active price bank and pending activations on the controller.
                  </p>
                </div>
                <Badge
                  variant={
                    hasPendingEntries
                      ? STATUS_VARIANT.INFO
                      : supportsPendingQueue
                        ? STATUS_VARIANT.SUCCESS
                        : STATUS_VARIANT.WARN
                  }
                >
                  {hasPendingEntries
                    ? `${pending.length} pending`
                    : supportsPendingQueue
                      ? '0 pending'
                      : 'queue unsupported'}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">Current price set</div>
                  <div className="text-lg font-semibold">
                    {currentBank?.fcPriceSetId ?? '—'}
                  </div>
                </div>
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">Price groups</div>
                  <div className="text-lg font-semibold">
                    {currentBank?.fcPriceGroupIds.length ?? 0}
                  </div>
                </div>
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">Grades in bank</div>
                  <div className="text-lg font-semibold">
                    {currentBank?.fcGradeIds.length ?? 0}
                  </div>
                </div>
              </div>

              {priceStateError ? (
                <div className="rounded-card border border-rose-300/40 bg-rose-500/10 p-3 text-xs text-rose-100">
                  Unable to load DOMS price state from the active forecourt connection: {priceStateError}
                </div>
              ) : priceState?.currentError ? (
                <div className="rounded-card border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                  Unable to load the current active price bank: {priceState.currentError}
                </div>
              ) : null}

              {warnings.map((warning, index) => (
                <div
                  key={`${warning}-${index}`}
                  className="rounded-card border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100"
                >
                  {warning}
                </div>
              ))}

              {hasPendingEntries ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Pending activations
                  </div>
                  {pending.map((item) => {
                    const pendingStatus = describePendingStatus(
                      item,
                      supportsPendingQueue,
                    )
                    return (
                      <div
                        key={`${item.fcPriceSetId}-${item.activationAt}`}
                        className="rounded-card border border-border bg-surface-card p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              Price set {item.fcPriceSetId}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              Activates {formatActivationAt(item.activationAt)}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {pendingStatus.detail}
                            </div>
                          </div>
                          <Badge variant={pendingStatus.variant}>
                            {pendingStatus.label}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : supportsPendingQueue ? (
                <EmptyState
                  title="No pending price activations"
                  description="The DOMS controller is not currently holding any queued price sets."
                />
              ) : (
                <EmptyState
                  title="Pending queue not available"
                  description="This controller exposes only the active price set status. Immediate price changes can still be applied and verified from the active price bank."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Update product prices
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Apply now sends DOMS a zero activation timestamp for immediate activation. Schedule keeps the existing future activation workflow.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={applyMode === 'now' ? 'primary' : 'secondary'}
                  onClick={() => setApplyMode('now')}
                >
                  Apply now
                </Button>
                <Button
                  variant={applyMode === 'scheduled' ? 'primary' : 'secondary'}
                  onClick={() => setApplyMode('scheduled')}
                >
                  Schedule
                </Button>
              </div>

              {applyMode === 'scheduled' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      Effective date and time
                    </span>
                    <Input
                      type="datetime-local"
                      value={effectiveAt}
                      onChange={(e) => setEffectiveAt(e.target.value)}
                    />
                  </label>
                  <div className="rounded-card border border-border bg-surface-card p-3 text-xs text-[var(--text-muted)]">
                    DOMS expects activation timestamps in controller time. The selected local clock time is preserved when converting to FC_DATE_AND_TIME.
                  </div>
                </div>
              ) : (
                <div className="rounded-card border border-border bg-surface-card p-3 text-xs text-[var(--text-muted)]">
                  The update will be sent with PriceSetActivationDateAndTime = 00000000000000. DOMS may still apply configured device delays to pumps or price poles after the price bank becomes active.
                </div>
              )}

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-card border border-border bg-surface-card p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
                  >
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        Product {index + 1}
                      </span>
                      <Select
                        value={row.productId}
                        onChange={(e) =>
                          updateRow(row.id, { productId: e.target.value })
                        }
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option
                            key={product.id}
                            value={product.productId || product.id}
                          >
                            {product.productName} ({product.productId || product.id})
                          </option>
                        ))}
                      </Select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        Raw price
                      </span>
                      <Input
                        inputMode="numeric"
                        placeholder="2199"
                        value={row.price}
                        onChange={(e) =>
                          updateRow(row.id, {
                            price: e.target.value.replace(/[^0-9]/g, ''),
                          })
                        }
                      />
                    </label>

                    <div className="flex items-end">
                      <Button
                        variant="secondary"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={addRow}>
                  Add product
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting
                    ? applyMode === 'now'
                      ? 'Applying…'
                      : 'Scheduling…'
                    : applyMode === 'now'
                      ? 'Apply on DOMS'
                      : 'Schedule on DOMS'}
                </Button>
              </div>

              {submitError ? (
                <div className="rounded-card border border-rose-300/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                  {submitError}
                </div>
              ) : null}

              {submitMessage ? (
                <div className="rounded-card border border-emerald-300/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  {submitMessage}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
