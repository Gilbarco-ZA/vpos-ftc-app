'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ACTION_STATUS } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
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
import { StatCard } from '@/components/ui/stat-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TankOption = {
  id: string
  code: string
  name: string
  productId: string
  productName: string
  productCode: string
  capacityLitres: number
  unitPrice: number | null
}

type TankSummary = {
  tankId: string
  tankCode: string
  tankName: string
  status: string
  productName: string
  productCode: string
  capacityLitres: number
  lowLevelLitres: number | null
  criticalLevelLitres: number | null
  liveVolumeLitres: number | null
  manualVolumeLitres: number | null
  baselineSource: 'stock_count' | 'manual' | 'live' | 'none'
  baselineLitres: number
  currentVolumeLitres: number
  movementBalanceLitres: number
  lastStockCountAt: string | null
  lastDeliveryAt: string | null
  lastDeductionAt: string | null
  proxyPendingCount: number
  proxyFailedCount: number
}

type TankMovement = {
  id: string
  tankId: string
  tankCode: string
  tankName: string
  productName: string
  productCode: string
  movementType: 'STOCK_IN' | 'DEDUCTION'
  stockInType: 'StockCount' | 'Delivery' | null
  documentId: string
  quantityLitres: number
  unitPrice: number | null
  purchaseDate: string | null
  effectiveAt: string
  supplierName: string | null
  supplierInvoiceNumber: string | null
  createdByName: string | null
  sourceTransactionId: string | null
  sourceTransactionReference: string | null
  proxyStatus: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'
  createdAt: string
}

type TankLevelsResponse = {
  tanks: TankOption[]
  summary: TankSummary[]
  recentMovements: TankMovement[]
}

type FormState = {
  tankId: string
  stockInType: 'StockCount' | 'Delivery'
  quantityLitres: string
  unitPrice: string
  purchaseDate: string
  supplierPin: string
  supplierName: string
  supplierInvoiceNumber: string
  documentId: string
  createdByName: string
  sendToProxy: boolean
}

type StatusMessage = {
  type: 'success' | 'error'
  message: string
}

const formatLitres = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} L`
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

const today = () => new Date().toISOString().slice(0, 10)

const resolveMovementDocumentLabel = (movement: TankMovement) =>
  movement.movementType === 'DEDUCTION' ? 'Invoice ref' : 'Document'

const resolveMovementDocumentValue = (movement: TankMovement) => {
  if (movement.movementType === 'DEDUCTION') {
    return movement.sourceTransactionReference || movement.documentId || '—'
  }
  return movement.documentId || '—'
}

const resolveMovementReferenceValue = (movement: TankMovement) => {
  if (movement.movementType === 'DEDUCTION') {
    return movement.documentId || movement.sourceTransactionId || '—'
  }
  return movement.supplierInvoiceNumber || movement.sourceTransactionId || '—'
}

const emptyForm = (createdByName: string): FormState => ({
  tankId: '',
  stockInType: 'StockCount',
  quantityLitres: '',
  unitPrice: '',
  purchaseDate: today(),
  supplierPin: '',
  supplierName: '',
  supplierInvoiceNumber: '',
  documentId: '',
  createdByName,
  sendToProxy: true,
})

const statusVariantForProxy = (
  status: TankMovement['proxyStatus'],
): 'success' | 'warn' | 'error' | 'neutral' => {
  if (status === 'SENT') return 'success'
  if (status === 'FAILED') return 'error'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

const statusVariantForLevel = (
  summary: TankSummary,
): 'success' | 'warn' | 'error' | 'neutral' => {
  const current = summary.currentVolumeLitres
  if (
    summary.criticalLevelLitres !== null &&
    current <= summary.criticalLevelLitres
  ) {
    return 'error'
  }
  if (summary.lowLevelLitres !== null && current <= summary.lowLevelLitres) {
    return 'warn'
  }
  if (current > summary.capacityLitres) return 'error'
  return 'success'
}

const labelForLevel = (summary: TankSummary) => {
  if (summary.currentVolumeLitres > summary.capacityLitres)
    return 'Over capacity'
  if (
    summary.criticalLevelLitres !== null &&
    summary.currentVolumeLitres <= summary.criticalLevelLitres
  ) {
    return 'Critical'
  }
  if (
    summary.lowLevelLitres !== null &&
    summary.currentVolumeLitres <= summary.lowLevelLitres
  ) {
    return 'Low'
  }
  return 'Healthy'
}

const progressClassForLevel = (
  variant: ReturnType<typeof statusVariantForLevel>,
) => {
  if (variant === 'success') return 'bg-[var(--status-success-text)]'
  if (variant === 'warn') return 'bg-[var(--status-warn-text)]'
  if (variant === 'error') return 'bg-[var(--status-error-text)]'
  return 'bg-[var(--text-muted)]'
}

export default function TankLevelsPageClient({
  createdByName,
}: {
  createdByName: string
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRetryingId, setIsRetryingId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [data, setData] = useState<TankLevelsResponse>({
    tanks: [],
    summary: [],
    recentMovements: [],
  })
  const [form, setForm] = useState<FormState>(emptyForm(createdByName))

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/tank-levels', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        data?: TankLevelsResponse
        error?: { message?: string }
      }
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Failed to load tank levels')
      }
      setData(
        body?.data ?? {
          tanks: [],
          summary: [],
          recentMovements: [],
        },
      )
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load tank levels')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedTank = useMemo(
    () => data.tanks.find((tank) => tank.id === form.tankId) ?? null,
    [data.tanks, form.tankId],
  )

  const totals = useMemo(() => {
    const totalVolume = data.summary.reduce(
      (sum, item) => sum + Number(item.currentVolumeLitres || 0),
      0,
    )
    const lowCount = data.summary.filter(
      (item) =>
        item.lowLevelLitres !== null &&
        item.currentVolumeLitres <= item.lowLevelLitres,
    ).length
    const criticalCount = data.summary.filter(
      (item) =>
        item.criticalLevelLitres !== null &&
        item.currentVolumeLitres <= item.criticalLevelLitres,
    ).length
    const failedSyncs = data.summary.reduce(
      (sum, item) => sum + Number(item.proxyFailedCount || 0),
      0,
    )
    return { totalVolume, lowCount, criticalCount, failedSyncs }
  }, [data.summary])

  const openSheet = () => {
    setForm(emptyForm(createdByName))
    setStatus(null)
    setSheetOpen(true)
  }

  const saveEntry = async () => {
    setStatus(null)
    const quantity = Number(form.quantityLitres)
    const unitPrice = form.unitPrice.trim() ? Number(form.unitPrice) : null
    if (!form.tankId) {
      setStatus({ type: ACTION_STATUS.ERROR, message: 'Select a tank first.' })
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStatus({
        type: ACTION_STATUS.ERROR,
        message: 'Quantity must be greater than zero.',
      })
      return
    }
    if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      setStatus({
        type: ACTION_STATUS.ERROR,
        message: 'Unit price is invalid.',
      })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/tank-levels', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          data: {
            ...form,
            quantityLitres: quantity,
            unitPrice,
          },
          csrf_token: csrfToken,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Failed to save entry')
      }
      await loadData()
      setSheetOpen(false)
      setForm(emptyForm(createdByName))
      const proxyState =
        body?.data?.proxy?.ok === false ? ' Proxy send failed.' : ''
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: `${form.stockInType} entry saved.${proxyState}`,
      })
    } catch (err: any) {
      setStatus({
        type: ACTION_STATUS.ERROR,
        message: err?.message || 'Failed to save tank movement.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const retrySend = async (movementId: string) => {
    setIsRetryingId(movementId)
    setStatus(null)
    try {
      const res = await fetch(`/api/tank-levels/${movementId}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ csrf_token: csrfToken }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Failed to retry proxy send')
      }
      await loadData()
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: 'Movement sent to proxy.',
      })
    } catch (err: any) {
      setStatus({
        type: ACTION_STATUS.ERROR,
        message: err?.message || 'Failed to send movement to proxy.',
      })
    } finally {
      setIsRetryingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />

      <PageHeader
        title="Tank Levels"
        description="Capture stock counts and deliveries, then monitor live tank positions as invoices deduct stock."
        actions={
          <Button type="button" variant="primary" onClick={openSheet}>
            Capture Level
          </Button>
        }
      />

      {status && <Alert variant={status.type}>{status.message}</Alert>}

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="Total tank stock"
          value={formatLitres(totals.totalVolume)}
        />
        <StatCard label="Low tanks" value={String(totals.lowCount)} />
        <StatCard label="Critical tanks" value={String(totals.criticalCount)} />
        <StatCard
          label="Failed proxy sends"
          value={String(totals.failedSyncs)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current tank positions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-[var(--text-muted)]">
              Loading tank levels...
            </div>
          ) : data.summary.length === 0 ? (
            <EmptyState
              title="No tanks found"
              description="Create tanks first, then capture stock counts or deliveries here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.summary.map((tank) => {
                const percent =
                  tank.capacityLitres > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          (tank.currentVolumeLitres / tank.capacityLitres) *
                            100,
                        ),
                      )
                    : 0
                const levelVariant = statusVariantForLevel(tank)
                return (
                  <div
                    key={tank.tankId}
                    className="rounded-lg border border-border bg-surface-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {tank.tankCode || tank.tankName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {tank.productName} ({tank.productCode})
                        </div>
                      </div>
                      <Badge variant={levelVariant}>
                        {labelForLevel(tank)}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-2xl font-semibold text-[var(--text-primary)]">
                          {formatLitres(tank.currentVolumeLitres)}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          / {formatLitres(tank.capacityLitres)}
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-hover)]">
                        <div
                          className={`h-2 rounded-full ${progressClassForLevel(levelVariant)}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
                      <div>
                        <div className="text-[var(--text-muted)]">Baseline</div>
                        <div>{formatLitres(tank.baselineLitres)}</div>
                        <div className="capitalize">
                          {tank.baselineSource.replace('_', ' ')}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">
                          Movement balance
                        </div>
                        <div>
                          {tank.movementBalanceLitres >= 0 ? '+' : ''}
                          {formatLitres(tank.movementBalanceLitres)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">
                          Last stock count
                        </div>
                        <div>{formatDateTime(tank.lastStockCountAt)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">
                          Last deduction
                        </div>
                        <div>{formatDateTime(tank.lastDeductionAt)}</div>
                      </div>
                    </div>

                    {(tank.proxyPendingCount > 0 ||
                      tank.proxyFailedCount > 0) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {tank.proxyPendingCount > 0 && (
                          <Badge variant="warn">
                            {tank.proxyPendingCount} pending
                          </Badge>
                        )}
                        {tank.proxyFailedCount > 0 && (
                          <Badge variant="error">
                            {tank.proxyFailedCount} failed
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-[var(--text-muted)]">
              Loading recent activity...
            </div>
          ) : data.recentMovements.length === 0 ? (
            <EmptyState
              title="No stock movements yet"
              description="Stock counts, deliveries, and invoice deductions will appear here."
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tank</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>
                          <div className="font-medium text-[var(--text-primary)]">
                            {movement.tankCode || movement.tankName}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {movement.productName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant={
                                movement.movementType === 'DEDUCTION'
                                  ? 'error'
                                  : 'neutral'
                              }
                            >
                              {movement.movementType === 'DEDUCTION'
                                ? 'Invoice deduction'
                                : movement.stockInType || 'Stock In'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {movement.movementType === 'DEDUCTION' ? '-' : '+'}
                          {formatLitres(movement.quantityLitres)}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                            {resolveMovementDocumentLabel(movement)}
                          </div>
                          <div className="text-sm text-[var(--text-primary)]">
                            {resolveMovementDocumentValue(movement)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {resolveMovementReferenceValue(movement)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDateTime(movement.effectiveAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusVariantForProxy(
                              movement.proxyStatus,
                            )}
                          >
                            {movement.proxyStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {movement.movementType === 'STOCK_IN' &&
                          movement.proxyStatus === 'FAILED' ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => retrySend(movement.id)}
                              disabled={
                                isRetryingId === movement.id || !csrfToken
                              }
                            >
                              {isRetryingId === movement.id
                                ? 'Retrying...'
                                : 'Retry'}
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {data.recentMovements.map((movement) => (
                  <div key={movement.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">
                          {movement.tankCode || movement.tankName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {movement.productName}
                        </div>
                      </div>
                      <Badge
                        variant={statusVariantForProxy(movement.proxyStatus)}
                      >
                        {movement.proxyStatus}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge
                        variant={
                          movement.movementType === 'DEDUCTION'
                            ? 'error'
                            : 'neutral'
                        }
                      >
                        {movement.movementType === 'DEDUCTION'
                          ? 'Invoice deduction'
                          : movement.stockInType || 'Stock In'}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
                      <div>
                        <div className="text-[var(--text-muted)]">Quantity</div>
                        <div>
                          {movement.movementType === 'DEDUCTION' ? '-' : '+'}
                          {formatLitres(movement.quantityLitres)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">
                          Effective
                        </div>
                        <div>{formatDateTime(movement.effectiveAt)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">
                          {resolveMovementDocumentLabel(movement)}
                        </div>
                        <div>{resolveMovementDocumentValue(movement)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">
                          Reference
                        </div>
                        <div>{resolveMovementReferenceValue(movement)}</div>
                      </div>
                    </div>
                    {movement.movementType === 'STOCK_IN' &&
                      movement.proxyStatus === 'FAILED' && (
                        <div className="mt-3">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => retrySend(movement.id)}
                            disabled={
                              isRetryingId === movement.id || !csrfToken
                            }
                          >
                            {isRetryingId === movement.id
                              ? 'Retrying...'
                              : 'Retry proxy send'}
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[95vw] overflow-y-auto sm:w-[40rem]">
          <SheetHeader>
            <SheetTitle>Capture tank level</SheetTitle>
            <SheetDescription>
              Use StockCount for a counted tank baseline, or Delivery to add
              incoming stock.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <FormField label="Tank" required>
              <Select
                value={form.tankId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tankId: event.target.value,
                    unitPrice:
                      !current.unitPrice &&
                      data.tanks.find((item) => item.id === event.target.value)
                        ?.unitPrice != null
                        ? String(
                            data.tanks.find(
                              (item) => item.id === event.target.value,
                            )?.unitPrice ?? '',
                          )
                        : current.unitPrice,
                  }))
                }
              >
                <option value="">Select tank</option>
                {data.tanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.code || tank.name} — {tank.productName}
                  </option>
                ))}
              </Select>
            </FormField>

            {selectedTank && (
              <Alert variant="info">
                Product: {selectedTank.productName} ({selectedTank.productCode})
                · Capacity: {formatLitres(selectedTank.capacityLitres)}
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Entry type" required>
                <Select
                  value={form.stockInType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stockInType: event.target.value as
                        | 'StockCount'
                        | 'Delivery',
                    }))
                  }
                >
                  <option value="StockCount">StockCount</option>
                  <option value="Delivery">Delivery</option>
                </Select>
              </FormField>
              <FormField label="Purchase date" required>
                <Input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      purchaseDate: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Quantity (L)" required>
                <Input
                  inputMode="decimal"
                  placeholder="10000"
                  value={form.quantityLitres}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantityLitres: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Unit Price">
                <Input
                  inputMode="decimal"
                  placeholder="183"
                  value={form.unitPrice}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unitPrice: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Supplier TIN/PIN">
                <Input
                  value={form.supplierPin}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierPin: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Supplier name">
                <Input
                  value={form.supplierName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierName: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Document ID">
                <Input
                  value={form.documentId}
                  placeholder="Auto-generate if left blank"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      documentId: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Supplier invoice number">
                <Input
                  value={form.supplierInvoiceNumber}
                  placeholder="Defaults to document ID"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierInvoiceNumber: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Created by">
                <Input
                  value={form.createdByName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      createdByName: event.target.value,
                    }))
                  }
                />
              </FormField>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={saveEntry}
              disabled={isSaving || !csrfToken}
            >
              {isSaving ? 'Saving...' : 'Save movement'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
