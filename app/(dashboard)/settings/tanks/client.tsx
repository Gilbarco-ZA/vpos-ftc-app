'use client'

import type { ActionStatus } from '@/src/shared/status/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Label } from '@radix-ui/react-dropdown-menu'

import { toNumberStrict as parseNumber } from '@/src/shared/numbers'
import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  liveVolumeUpdatedAt?: string | null
  manualVolumeLitres?: number | null
  manualVolumeRecordedAt?: string | null
  manualVolumeRecordedBy?: string
}

type StatusOption = {
  value: 'ACTIVE' | 'INACTIVE'
  label: string
}

type TankGroupOption = { id: string; code: string; name: string }

type TankSettingsResponse = {
  tanks: TankListItem[]
  products: TankProductOption[]
  tankGroups?: TankGroupOption[]
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

export default function TankSettingsClient() {
  const [csrfToken, setCsrfToken] = useState('')
  const [tanks, setTanks] = useState<TankListItem[]>([])
  const [products, setProducts] = useState<TankProductOption[]>([])
  const [tankGroups, setTankGroups] = useState<TankGroupOption[]>([])
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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
      setTankGroups(body?.data?.tankGroups ?? [])
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
    loadData()
    loadStatusOptions()
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
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: `Synced ${(body?.data?.synced?.count ?? 0) as number} tank volume(s) from DOMS.`,
      })
    } catch (err: any) {
      const message =
        err?.error?.message || err?.message || 'Failed to sync tank volumes.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
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
            <div className="overflow-hidden rounded-card border border-border bg-surface-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Capacity (L)</TableHead>
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
