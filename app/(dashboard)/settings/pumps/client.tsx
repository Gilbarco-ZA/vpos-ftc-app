'use client'

import type { ActionStatus } from '@/src/shared/status/ui'
import type { Socket } from 'socket.io-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { io } from 'socket.io-client'

import { toNumberStrict as parseNumber } from '@/src/shared/numbers'
import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import {
  forecourtBadge,
  useForecourtConnection,
} from '@/src/modules/forecourt/client/useForecourtConnection'

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

export type PumpListItem = {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  hasNozzleSelector: boolean
  pumpNumber: number
  tankGroupId?: string
  tankGroupName?: string
}

type TankGroupOption = { id: string; code: string; name: string }

type PumpSettingsResponse = {
  pumps: PumpListItem[]
  tankGroups?: TankGroupOption[]
}

type Option = { value: string; label: string }

type PumpFormState = {
  id?: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  pumpNumber: string
  hasNozzleSelector: string
  tankGroupName: string
}

type PumpFormErrors = Partial<Record<keyof PumpFormState, string>>

type StatusMessage = {
  type: ActionStatus
  message: string
}

const formatLastSeen = (value: number | null | undefined) => {
  if (!value) return 'Never'
  return new Date(value).toLocaleTimeString()
}

const emptyForm = (): PumpFormState => ({
  code: '',
  name: '',
  status: 'ACTIVE',
  pumpNumber: '',
  hasNozzleSelector: 'false',
  tankGroupName: '',
})

export default function PumpSettingsClient({
  stationId,
}: {
  stationId: string
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [pumps, setPumps] = useState<PumpListItem[]>([])
  const [statusOptions, setStatusOptions] = useState<Option[]>([
    { value: 'ACTIVE', label: 'ACTIVE' },
    { value: 'INACTIVE', label: 'INACTIVE' },
  ])
  const [yesNoOptions, setYesNoOptions] = useState<Option[]>([
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<PumpFormState>(emptyForm())
  const [formErrors, setFormErrors] = useState<PumpFormErrors>({})
  const forecourtConn = useForecourtConnection(stationId)
  const socketRef = useRef<Socket | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/settings/pumps', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        data?: PumpSettingsResponse
      }
      if (!res.ok) throw body
      setPumps(body?.data?.pumps ?? [])
    } catch (err) {
      setLoadError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const [statusRes, yesNoRes] = await Promise.all([
        fetch('/api/config/pump-statuses', { cache: 'no-store' }),
        fetch('/api/config/yes-no', { cache: 'no-store' }),
      ])
      const statusBody = await statusRes.json().catch(() => ({}))
      const yesNoBody = await yesNoRes.json().catch(() => ({}))
      if (statusRes.ok) {
        setStatusOptions(
          Array.isArray(statusBody?.data?.options)
            ? statusBody.data.options
            : [],
        )
      }
      if (yesNoRes.ok) {
        setYesNoOptions(
          Array.isArray(yesNoBody?.data?.options) ? yesNoBody.data.options : [],
        )
      }
    } catch {}
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      loadData()
    })
    queueMicrotask(() => {
      loadConfig()
    })
  }, [loadData, loadConfig])

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: '/ws/forecourt',
      transports: ['websocket'],
      upgrade: false,
      query: { stationId },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    })
    socketRef.current = socket

    return () => {
      socketRef.current?.disconnect()
    }
  }, [stationId])

  const filteredPumps = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return pumps
    return pumps.filter((pump) => {
      const haystack =
        `${pump.code} ${pump.name} ${pump.pumpNumber}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [pumps, search])

  const openCreate = () => {
    setForm(emptyForm())
    setFormErrors({})
    setStatus(null)
    setSheetOpen(true)
  }

  const openEdit = (pump: PumpListItem) => {
    setForm({
      id: pump.id,
      code: pump.code,
      name: pump.name,
      status: pump.status,
      pumpNumber: String(pump.pumpNumber ?? ''),
      hasNozzleSelector: pump.hasNozzleSelector ? 'true' : 'false',
      tankGroupName: pump.tankGroupName ?? '',
    })
    setFormErrors({})
    setStatus(null)
    setSheetOpen(true)
  }

  const validateForm = () => {
    const nextErrors: PumpFormErrors = {}
    if (!form.code.trim()) nextErrors.code = 'Code is required'
    if (!form.name.trim()) nextErrors.name = 'Name is required'
    if (!form.pumpNumber.trim())
      nextErrors.pumpNumber = 'Pump number is required'
    const pumpNumber = parseNumber(form.pumpNumber)
    if (pumpNumber === null || pumpNumber <= 0) {
      nextErrors.pumpNumber = 'Pump number must be greater than zero'
    }
    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const savePump = async () => {
    setStatus(null)
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const payload = {
        id: form.id,
        code: form.code.trim(),
        name: form.name.trim(),
        status: form.status,
        pumpNumber: parseNumber(form.pumpNumber),
        hasNozzleSelector: form.hasNozzleSelector === 'true',
        tankGroupName: form.tankGroupName.trim(),
        csrf_token: csrfToken,
      }

      const res = await fetch('/api/settings/pumps', {
        method: form.id ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ data: payload, csrf_token: csrfToken }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body

      await loadData()
      setSheetOpen(false)
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: form.id ? 'Pump updated.' : 'Pump created.',
      })
    } catch (err: any) {
      const message =
        err?.error?.message ||
        err?.message ||
        'Failed to save pump. Check inputs and try again.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />

      <PageHeader
        title="Pump Management"
        description="Manage pumps, numbering, and selector settings."
        actions={
          <Button variant="primary" onClick={openCreate}>
            Add pump
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-muted)]">
              Forecourt connection
            </div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {forecourtBadge(forecourtConn?.status).label}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-[var(--text-muted)]">
              Last seen: {formatLastSeen(forecourtConn?.lastSeenAt)}
            </div>
            <Badge variant={forecourtBadge(forecourtConn?.status).variant}>
              {forecourtBadge(forecourtConn?.status).label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search pumps"
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
              title="Unable to load pumps"
              message="Please retry."
              error={loadError}
            />
          ) : filteredPumps.length === 0 ? (
            <EmptyState
              title="No pumps found"
              description="Create a pump to assign a unique pump number."
              action={
                <Button variant="primary" onClick={openCreate}>
                  Add pump
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
                    <TableHead className="text-right">Pump #</TableHead>
                    <TableHead>Nozzle selector</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPumps.map((pump) => (
                    <TableRow key={pump.id}>
                      <TableCell className="font-medium">{pump.code}</TableCell>
                      <TableCell>{pump.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            pump.status === 'ACTIVE'
                              ? STATUS_VARIANT.SUCCESS
                              : STATUS_VARIANT.INFO
                          }
                        >
                          {pump.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {pump.pumpNumber}
                      </TableCell>
                      <TableCell>
                        {pump.hasNozzleSelector ? 'Yes' : 'No'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => openEdit(pump)}
                          >
                            Edit
                          </Button>
                          <Button variant="ghost" asChild>
                            <Link href={`/settings/pumps/${pump.id}`}>
                              Nozzles
                            </Link>
                          </Button>
                        </div>
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
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{form.id ? 'Edit pump' : 'Add pump'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="text-xs text-[var(--text-muted)]">Code</div>
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
            <div className="text-xs text-[var(--text-muted)]">Name</div>
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
            <div className="text-xs text-[var(--text-muted)]">Pump number</div>
            <Input
              placeholder="Pump number"
              type="number"
              value={form.pumpNumber}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, pumpNumber: event.target.value }))
              }
            />
            {formErrors.pumpNumber && (
              <p className="text-xs text-red-600">{formErrors.pumpNumber}</p>
            )}
            <div className="text-xs text-[var(--text-muted)]">Pump Status</div>
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
            <div className="text-xs text-[var(--text-muted)]">Has Nozzle</div>
            <Select
              value={form.hasNozzleSelector}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  hasNozzleSelector: event.target.value,
                }))
              }
            >
              {yesNoOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="secondary"
              onClick={() => setSheetOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={savePump} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save pump'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
