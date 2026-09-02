'use client'

import type { ActionStatus } from '@/src/shared/status/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { toNumberStrict as parseNumber } from '@/src/shared/numbers'
import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type TankProductOption = {
  id: string
  name: string
  code: string
}

export type TankListItem = {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  productId: string
  productName: string
  productCode: string
  capacityLitres: number
  lowLevelLitres: number | null
  criticalLevelLitres: number | null
  tankGroupId?: string
  tankGroupName?: string
  domsTankId?: string
  liveVolumeLitres?: number | null
  liveTcVolumeLitres?: number | null
  liveTemperatureC?: number | null
  liveVolumeUpdatedAt?: string | null
  manualVolumeLitres?: number | null
  manualVolumeRecordedAt?: string | null
  manualVolumeRecordedBy?: string
  atgProductLevelMm?: number | null
  atgWaterLevelMm?: number | null
  atgWaterVolumeLitres?: number | null
  atgAvailableRoomLitres?: number | null
  atgGaugeOnline?: boolean | null
  atgInventoryDataReady?: boolean | null
  atgGaugeAlarmActive?: boolean | null
  atgGaugeErrorActive?: boolean | null
  atgControllerUpdatedAt?: string | null
  atgCapturedAt?: string | null
}

type StatusOption = {
  value: 'ACTIVE' | 'INACTIVE'
  label: string
}

type TankGroupOption = { id: string; code: string; name: string }

type AtgPollingSettings = {
  enabled: boolean
  intervalMinutes: number
}

type TankSettingsResponse = {
  tanks: TankListItem[]
  products: TankProductOption[]
  tankGroups?: TankGroupOption[]
  atgPolling?: AtgPollingSettings
}

type TankFormState = {
  id?: string
  code: string
  name: string
  productId: string
  capacityLitres: string
  status: 'ACTIVE' | 'INACTIVE'
  lowLevelLitres: string
  criticalLevelLitres: string
  tankGroupName: string
  domsTankId: string
  manualVolumeLitres: string
}

type TankFormErrors = Partial<Record<keyof TankFormState, string>>

type StatusMessage = {
  type: ActionStatus
  message: string
}

const emptyForm = (): TankFormState => ({
  code: '',
  name: '',
  productId: '',
  capacityLitres: '',
  status: 'ACTIVE',
  lowLevelLitres: '',
  criticalLevelLitres: '',
  tankGroupName: '',
  domsTankId: '',
  manualVolumeLitres: '',
})

const formatCapacity = (value: number | null) =>
  value === null || Number.isNaN(value) ? '—' : value.toLocaleString()

const formatMeasurement = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value)
    ? '—'
    : value.toLocaleString(undefined, { maximumFractionDigits: digits })

const formatAtgTime = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

export default function TankSettingsClient() {
  const [csrfToken, setCsrfToken] = useState('')
  const [tanks, setTanks] = useState<TankListItem[]>([])
  const [products, setProducts] = useState<TankProductOption[]>([])
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAtg, setIsSavingAtg] = useState(false)
  const [atgPolling, setAtgPolling] = useState<AtgPollingSettings>({
    enabled: false,
    intervalMinutes: 10,
  })
  const [loadError, setLoadError] = useState<unknown>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<TankFormState>(emptyForm())
  const [formErrors, setFormErrors] = useState<TankFormErrors>({})

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/settings/tanks', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        data?: TankSettingsResponse
      }
      if (!res.ok) {
        throw body
      }
      setTanks(body?.data?.tanks ?? [])
      setProducts(body?.data?.products ?? [])
      setAtgPolling(
        body?.data?.atgPolling ?? { enabled: false, intervalMinutes: 10 },
      )
    } catch (err) {
      setLoadError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadStatusOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/config/tank-statuses', {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return
      const options = Array.isArray(body?.data?.options)
        ? body.data.options
        : []
      setStatusOptions(options)
    } catch {}
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      loadData()
    })
    queueMicrotask(() => {
      loadStatusOptions()
    })
  }, [loadData, loadStatusOptions])

  const filteredTanks = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tanks
    return tanks.filter((tank) => {
      const haystack =
        `${tank.code} ${tank.name} ${tank.productName} ${tank.productCode}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [search, tanks])

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) =>
      `${product.name} ${product.code}`.toLowerCase().includes(term),
    )
  }, [productSearch, products])

  const selectedTank = useMemo(
    () =>
      form.id ? (tanks.find((tank) => tank.id === form.id) ?? null) : null,
    [form.id, tanks],
  )

  const openCreate = () => {
    setForm(emptyForm())
    setFormErrors({})
    setStatus(null)
    setProductSearch('')
    setSheetOpen(true)
  }

  const openEdit = (tank: TankListItem) => {
    setForm({
      id: tank.id,
      code: tank.code,
      name: tank.name,
      productId: tank.productId,
      capacityLitres: String(tank.capacityLitres ?? ''),
      status: tank.status,
      lowLevelLitres:
        tank.lowLevelLitres === null ? '' : String(tank.lowLevelLitres),
      criticalLevelLitres:
        tank.criticalLevelLitres === null
          ? ''
          : String(tank.criticalLevelLitres),
      tankGroupName: tank.tankGroupName ?? '',
      domsTankId: tank.domsTankId ?? '',
      manualVolumeLitres:
        tank.manualVolumeLitres === null ||
        tank.manualVolumeLitres === undefined
          ? ''
          : String(tank.manualVolumeLitres),
    })
    setFormErrors({})
    setStatus(null)
    setProductSearch('')
    setSheetOpen(true)
  }

  const validateForm = () => {
    const nextErrors: TankFormErrors = {}
    if (!form.code.trim()) nextErrors.code = 'Code is required'
    if (!form.name.trim()) nextErrors.name = 'Name is required'
    if (!form.productId) nextErrors.productId = 'Product is required'

    const capacity = parseNumber(form.capacityLitres)
    if (capacity === null || capacity <= 0) {
      nextErrors.capacityLitres = 'Capacity must be greater than zero'
    }

    const low = parseNumber(form.lowLevelLitres)
    const critical = parseNumber(form.criticalLevelLitres)
    if (capacity !== null) {
      if (low !== null && low > capacity) {
        nextErrors.lowLevelLitres = 'Low level must be <= capacity'
      }
      if (critical !== null && critical > capacity) {
        nextErrors.criticalLevelLitres = 'Critical level must be <= capacity'
      }
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const syncLiveVolumes = async () => {
    setStatus(null)
    try {
      const res = await fetch('/api/settings/tanks/sync-volumes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csrf_token: csrfToken }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body
      await loadData()
      const synced = body?.data?.synced
      const syncedCount = Number(
        typeof synced === 'number' ? synced : (synced?.count ?? 0),
      )
      const requestedCount = Number(
        typeof synced === 'object' && synced !== null
          ? (synced?.requested ?? syncedCount)
          : syncedCount,
      )
      const controllerErrorCount =
        typeof synced === 'object' &&
        synced !== null &&
        Array.isArray(synced?.controllerErrors)
          ? synced.controllerErrors.length
          : 0
      const message =
        requestedCount > syncedCount || controllerErrorCount > 0
          ? `Synced ${syncedCount} of ${requestedCount} tank volume(s) from DOMS${
              controllerErrorCount > 0
                ? `; ${controllerErrorCount} gauge request(s) failed.`
                : '.'
            }`
          : `Synced ${syncedCount} tank volume(s) from DOMS.`
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message,
      })
    } catch (err: any) {
      const message =
        err?.error?.message || err?.message || 'Failed to sync tank volumes.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    }
  }

  const saveAtgPolling = async () => {
    setStatus(null)
    const intervalMinutes = Number(atgPolling.intervalMinutes)
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < 1 ||
      intervalMinutes > 1440
    ) {
      setStatus({
        type: ACTION_STATUS.ERROR,
        message:
          'ATG interval must be a whole number between 1 and 1440 minutes.',
      })
      return
    }

    setIsSavingAtg(true)
    try {
      const res = await fetch('/api/settings/tanks/atg-polling', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          data: {
            enabled: atgPolling.enabled,
            intervalMinutes,
          },
          csrf_token: csrfToken,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body
      setAtgPolling(body?.data ?? atgPolling)
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: atgPolling.enabled
          ? `ATG polling worker enabled every ${intervalMinutes} minute(s).`
          : 'ATG polling worker disabled.',
      })
    } catch (err: any) {
      const message =
        err?.error?.message ||
        err?.message ||
        'Failed to save ATG worker settings.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSavingAtg(false)
    }
  }

  const saveTank = async () => {
    setStatus(null)
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const payload = {
        id: form.id,
        code: form.code.trim(),
        name: form.name.trim(),
        productId: form.productId,
        capacityLitres: parseNumber(form.capacityLitres),
        status: form.status,
        lowLevelLitres: parseNumber(form.lowLevelLitres),
        criticalLevelLitres: parseNumber(form.criticalLevelLitres),
        tankGroupName: form.tankGroupName.trim(),
        domsTankId: form.domsTankId.trim(),
        manualVolumeLitres: parseNumber(form.manualVolumeLitres),
        csrf_token: csrfToken,
      }

      const res = await fetch('/api/settings/tanks', {
        method: form.id ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ data: payload, csrf_token: csrfToken }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw body
      }

      await loadData()
      setSheetOpen(false)
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: form.id ? 'Tank updated.' : 'Tank created.',
      })
    } catch (err: any) {
      const message =
        err?.error?.message ||
        err?.message ||
        'Failed to save tank. Check inputs and try again.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />

      <PageHeader
        title="Tank Management"
        description="Manage station storage tanks and product assignments."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={syncLiveVolumes}>
              Sync DOMS volumes
            </Button>
            <Button variant="primary" onClick={openCreate}>
              Add tank
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>ATG polling worker</CardTitle>
          <CardDescription>
            Periodically collect all configured tank-gauge data from DOMS using
            GET_ALL_TG_DATA. Each run updates the current tank values and
            replaces the locally stored latest ATG snapshot. Historical
            retention is handled in the cloud.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <label className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Checkbox
                checked={atgPolling.enabled}
                onChange={(event) =>
                  setAtgPolling((prev) => ({
                    ...prev,
                    enabled: event.target.checked,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  Enable automatic ATG capture
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Disabled by default until explicitly enabled for the station.
                </span>
              </span>
            </label>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Capture interval (minutes)
              </label>
              <Input
                type="number"
                min={1}
                max={1440}
                step={1}
                value={atgPolling.intervalMinutes}
                onChange={(event) =>
                  setAtgPolling((prev) => ({
                    ...prev,
                    intervalMinutes: Number(event.target.value),
                  }))
                }
              />
            </div>

            <Button
              variant="primary"
              onClick={saveAtgPolling}
              disabled={isSavingAtg}
            >
              {isSavingAtg ? 'Saving...' : 'Save ATG settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search tanks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-xs"
            />
            {status && (
              <Badge
                variant={
                  status.type === ACTION_STATUS.SUCCESS
                    ? STATUS_VARIANT.SUCCESS
                    : STATUS_VARIANT.ERROR
                }
              >
                {status.message}
              </Badge>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : loadError ? (
            <ErrorDetails
              title="Unable to load tanks"
              message="Please retry."
              error={loadError}
            />
          ) : filteredTanks.length === 0 ? (
            <EmptyState
              title="No tanks found"
              description="Create a tank to link it to a product and monitor capacity thresholds."
              action={
                <Button variant="primary" onClick={openCreate}>
                  Add tank
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Capacity (L)</TableHead>
                    <TableHead>Live ATG</TableHead>
                    <TableHead className="text-right">Low level (L)</TableHead>
                    <TableHead className="text-right">Critical (L)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTanks.map((tank) => (
                    <TableRow key={tank.id}>
                      <TableCell className="font-medium">{tank.code}</TableCell>
                      <TableCell>{tank.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tank.status === 'ACTIVE'
                              ? STATUS_VARIANT.SUCCESS
                              : STATUS_VARIANT.INFO
                          }
                        >
                          {tank.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {tank.productName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {tank.productCode}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCapacity(tank.capacityLitres)}
                      </TableCell>
                      <TableCell>
                        {tank.liveVolumeLitres === null ||
                        tank.liveVolumeLitres === undefined ? (
                          <div className="text-sm text-[var(--text-muted)]">
                            No ATG reading
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="font-medium text-[var(--text-primary)]">
                              {formatMeasurement(tank.liveVolumeLitres)} L
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              TC {formatMeasurement(tank.liveTcVolumeLitres)} L
                              · {formatMeasurement(tank.liveTemperatureC, 1)} °C
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              Level{' '}
                              {formatMeasurement(tank.atgProductLevelMm, 1)} mm
                              · Water{' '}
                              {formatMeasurement(tank.atgWaterVolumeLitres)} L
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-xs">
                              <Badge
                                variant={
                                  tank.atgGaugeOnline === false
                                    ? STATUS_VARIANT.ERROR
                                    : STATUS_VARIANT.SUCCESS
                                }
                              >
                                {tank.atgGaugeOnline === false
                                  ? 'Gauge offline'
                                  : 'Gauge online'}
                              </Badge>
                              <Badge
                                variant={
                                  tank.atgInventoryDataReady === false
                                    ? STATUS_VARIANT.WARN
                                    : STATUS_VARIANT.INFO
                                }
                              >
                                {tank.atgInventoryDataReady === false
                                  ? 'Inventory pending'
                                  : 'Inventory ready'}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              Updated{' '}
                              {formatAtgTime(
                                tank.atgControllerUpdatedAt ??
                                  tank.liveVolumeUpdatedAt,
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCapacity(tank.lowLevelLitres)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCapacity(tank.criticalLevelLitres)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          onClick={() => openEdit(tank)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{form.id ? 'Edit tank' : 'Add tank'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-2">
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Code
              </label>
              <Input
                placeholder="Code"
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
              />
              {formErrors.code && (
                <p className="text-xs text-red-600">{formErrors.code}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Name
              </label>
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              {formErrors.name && (
                <p className="text-xs text-red-600">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-secondary)]">
                  Search products
                </label>
                <Input
                  placeholder="Search products"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[var(--text-secondary)]">
                  Product
                </label>
                <Select
                  value={form.productId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      productId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select product</option>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.code})
                    </option>
                  ))}
                </Select>
              </div>

              {formErrors.productId && (
                <p className="text-xs text-red-600">{formErrors.productId}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Capacity (litres)
              </label>
              <Input
                placeholder="Capacity (litres)"
                type="number"
                value={form.capacityLitres}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    capacityLitres: event.target.value,
                  }))
                }
              />
              {formErrors.capacityLitres && (
                <p className="text-xs text-red-600">
                  {formErrors.capacityLitres}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Status
              </label>
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as 'ACTIVE' | 'INACTIVE',
                  }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Low level (litres)
              </label>
              <Input
                placeholder="Low level (litres)"
                type="number"
                value={form.lowLevelLitres}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    lowLevelLitres: event.target.value,
                  }))
                }
              />
              {formErrors.lowLevelLitres && (
                <p className="text-xs text-red-600">
                  {formErrors.lowLevelLitres}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Critical level (litres)
              </label>
              <Input
                placeholder="Critical level (litres)"
                type="number"
                value={form.criticalLevelLitres}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    criticalLevelLitres: event.target.value,
                  }))
                }
              />
              {formErrors.criticalLevelLitres && (
                <p className="text-xs text-red-600">
                  {formErrors.criticalLevelLitres}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Tank group
              </label>
              <Input
                placeholder="Tank group"
                value={form.tankGroupName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    tankGroupName: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                DOMS tank ID
              </label>
              <Input
                placeholder="DOMS tank ID"
                value={form.domsTankId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    domsTankId: event.target.value,
                  }))
                }
              />
            </div>

            {selectedTank && (
              <div className="rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  Live DOMS / ATG inventory
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <div className="text-[var(--text-muted)]">
                      Observed volume
                    </div>
                    <div>
                      {formatMeasurement(selectedTank.liveVolumeLitres)} L
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">TC volume</div>
                    <div>
                      {formatMeasurement(selectedTank.liveTcVolumeLitres)} L
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">
                      Product level
                    </div>
                    <div>
                      {formatMeasurement(selectedTank.atgProductLevelMm, 1)} mm
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Water</div>
                    <div>
                      {formatMeasurement(selectedTank.atgWaterVolumeLitres)} L
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Temperature</div>
                    <div>
                      {formatMeasurement(selectedTank.liveTemperatureC, 1)} °C
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">
                      Available room
                    </div>
                    <div>
                      {formatMeasurement(selectedTank.atgAvailableRoomLitres)} L
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                  Controller updated{' '}
                  {formatAtgTime(
                    selectedTank.atgControllerUpdatedAt ??
                      selectedTank.liveVolumeUpdatedAt,
                  )}
                  . These values are read-only and are refreshed by DOMS sync;
                  configured capacity and manual volume are not overwritten.
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">
                Manual volume (litres)
              </label>
              <Input
                placeholder="Manual volume (litres)"
                type="number"
                value={form.manualVolumeLitres}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    manualVolumeLitres: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <SheetFooter className="mt-6 border-t pt-4">
            <Button
              variant="secondary"
              onClick={() => setSheetOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={saveTank} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save tank'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
