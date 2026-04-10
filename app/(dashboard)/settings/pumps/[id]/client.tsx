'use client'

import type { PumpStateSnapshot } from '@/src/shared/pumps/types'
import type { Socket } from 'socket.io-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { io } from 'socket.io-client'

import { toNumberStrict as parseNumber } from '@/src/shared/numbers'
import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import { forecourtBadge } from '@/src/modules/forecourt/client/useForecourtConnection'

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

import type {
  ForecourtConnectionPayload,
  NozzleFormErrors,
  NozzleFormState,
  NozzleItem,
  NozzleResponse,
  PumpDetail,
  PumpDetailClientProps,
  SimPump,
  SimSnapshot,
  StatusMessage,
  TankListResponse,
  TankOption,
} from './types'
import {
  emptyForm,
  formatLastSeen,
  formatState,
  gradeLabel,
  stateVariant,
  upsertSimPump,
} from './helpers'

export default function PumpDetailClient({
  pump,
  stationId,
}: PumpDetailClientProps) {
  const [csrfToken, setCsrfToken] = useState('')
  const [nozzles, setNozzles] = useState<NozzleItem[]>([])
  const [tanks, setTanks] = useState<TankOption[]>([])
  const [search, setSearch] = useState('')
  const [tankSearch, setTankSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<NozzleFormState>(emptyForm())
  const [formErrors, setFormErrors] = useState<NozzleFormErrors>({})
  const [snapshot, setSnapshot] = useState<PumpStateSnapshot | null>(null)
  const [forecourtConn, setForecourtConn] =
    useState<ForecourtConnectionPayload | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const loadNozzles = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/settings/pumps/${pump.id}/nozzles`, {
        cache: 'no-store',
      })
      const body = (await res.json().catch(() => ({}))) as {
        data?: NozzleResponse
      }
      if (!res.ok) throw body
      setNozzles(body?.data?.nozzles ?? [])
    } catch (err) {
      setLoadError(err)
    } finally {
      setIsLoading(false)
    }
  }, [pump.id])

  const loadTanks = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/tanks', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        data?: TankListResponse
      }
      if (!res.ok) return
      const next = (body?.data?.tanks ?? []).map((tank) => ({
        id: tank.id,
        name: tank.name,
        productName: tank.productName,
        productCode: tank.productCode,
      }))
      setTanks(next)
    } catch {}
  }, [])

  useEffect(() => {
    loadNozzles()
    loadTanks()
  }, [loadNozzles, loadTanks])

  useEffect(() => {
    let mounted = true

    const socket = io(window.location.origin, {
      path: '/ws/forecourt',
      transports: ['websocket'],
      upgrade: false,
      query: { stationId },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    })
    socketRef.current = socket

    socket.on('message', (payload) => {
      if (!mounted) return
      try {
        const parsed =
          typeof payload === 'string' ? JSON.parse(payload) : payload
        if (parsed?.type === 'pump:state' && parsed?.data?.pumps) {
          setSnapshot(parsed.data as PumpStateSnapshot)
          return
        }

        if (parsed?.type === 'evt' && parsed?.event === 'forecourt.snapshot') {
          const snapshotPayload = parsed.payload as SimSnapshot
          if (snapshotPayload?.pumps?.length) {
            setSnapshot((prev) => {
              let next = prev ?? {
                stationId,
                pumps: [],
                updatedAt: Date.now(),
              }
              for (const simPump of snapshotPayload.pumps) {
                next = upsertSimPump(next, stationId, simPump)
              }
              return next
            })
          }
          return
        }

        if (parsed?.type === 'evt' && parsed?.event === 'pump.updated') {
          const simPump = parsed.payload as SimPump
          if (simPump && typeof simPump.id === 'number') {
            setSnapshot((prev) => upsertSimPump(prev, stationId, simPump))
          }
          return
        }

        if (parsed?.type === 'forecourt:conn') {
          const connPayload = parsed.data as ForecourtConnectionPayload
          if (connPayload?.stationId === stationId) {
            setForecourtConn(connPayload)
          }
        }
      } catch {}
    })

    return () => {
      mounted = false
      socketRef.current?.disconnect()
    }
  }, [stationId])

  const filteredNozzles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return nozzles
    return nozzles.filter((nozzle) => {
      const haystack =
        `${nozzle.nozzleNumber} ${nozzle.tankName} ${nozzle.productName} ${nozzle.productCode}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [nozzles, search])

  const filteredTanks = useMemo(() => {
    const term = tankSearch.trim().toLowerCase()
    if (!term) return tanks
    return tanks.filter((tank) =>
      `${tank.name} ${tank.productName} ${tank.productCode}`
        .toLowerCase()
        .includes(term),
    )
  }, [tankSearch, tanks])

  const nozzleStateMap = useMemo(() => {
    if (!snapshot) return new Map<string, string>()
    const pumpState = snapshot.pumps.find(
      (item) => Number(item.pumpId) === pump.pumpNumber,
    )
    if (!pumpState) return new Map<string, string>()
    const map = new Map<string, string>()
    pumpState.nozzles.forEach((item) => {
      map.set(String(item.nozzleId), item.state)
      const numeric = Number(item.nozzleId)
      if (Number.isFinite(numeric)) {
        map.set(String(numeric), item.state)
      }
    })
    return map
  }, [snapshot, pump.pumpNumber])

  const openCreate = () => {
    setForm(emptyForm())
    setFormErrors({})
    setStatus(null)
    setTankSearch('')
    setSheetOpen(true)
  }

  const openEdit = (nozzle: NozzleItem) => {
    setForm({
      id: nozzle.id,
      nozzleNumber: String(nozzle.nozzleNumber ?? ''),
      tankId: nozzle.tankId,
    })
    setFormErrors({})
    setStatus(null)
    setTankSearch('')
    setSheetOpen(true)
  }

  const validateForm = () => {
    const nextErrors: NozzleFormErrors = {}
    if (!form.nozzleNumber.trim()) nextErrors.nozzleNumber = 'Grade is required'
    const nozzleNumber = parseNumber(form.nozzleNumber)
    if (nozzleNumber === null || nozzleNumber <= 0) {
      nextErrors.nozzleNumber = 'Grade must be greater than zero'
    }
    if (!form.tankId) nextErrors.tankId = 'Tank is required'
    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const saveNozzle = async () => {
    setStatus(null)
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const payload = {
        id: form.id,
        nozzleNumber: parseNumber(form.nozzleNumber),
        tankId: form.tankId,
        csrf_token: csrfToken,
      }

      const res = await fetch(`/api/settings/pumps/${pump.id}/nozzles`, {
        method: form.id ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ data: payload, csrf_token: csrfToken }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body

      await loadNozzles()
      setSheetOpen(false)
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: form.id ? 'Nozzle updated.' : 'Nozzle created.',
      })
    } catch (err: any) {
      const message =
        err?.error?.message || err?.message || 'Failed to save nozzle.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  const deleteNozzle = async (nozzle: NozzleItem) => {
    setStatus(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/settings/pumps/${pump.id}/nozzles`, {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ id: nozzle.id, csrf_token: csrfToken }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body
      await loadNozzles()
      setStatus({ type: ACTION_STATUS.SUCCESS, message: 'Nozzle removed.' })
    } catch (err: any) {
      const message =
        err?.error?.message || err?.message || 'Failed to delete nozzle.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />

      <PageHeader
        title={`Pump ${pump.pumpNumber}`}
        description={`${pump.name} (${pump.code})`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/pumps">Back to pumps</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <div className="text-xs text-[var(--text-muted)]">Code</div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {pump.code}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)]">Status</div>
            <Badge
              variant={
                pump.status === 'ACTIVE'
                  ? STATUS_VARIANT.SUCCESS
                  : STATUS_VARIANT.INFO
              }
            >
              {pump.status}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)]">
              Nozzle selector
            </div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {pump.hasNozzleSelector ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)]">Pump number</div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {pump.pumpNumber}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-muted)]">
              Forecourt connection
            </div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {forecourtConn?.status ? 'Connected' : 'Unknown'}
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
          <PageHeader
            title="Nozzles"
            description="Assign tanks to nozzle grades for this pump."
            actions={
              <Button variant="primary" onClick={openCreate}>
                Add nozzle
              </Button>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search nozzles"
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
            </div>
          ) : loadError ? (
            <ErrorDetails
              title="Unable to load nozzles"
              message="Please retry."
              error={loadError}
            />
          ) : filteredNozzles.length === 0 ? (
            <EmptyState
              title="No nozzles assigned"
              description="Assign a tank to a nozzle grade to start tracking products."
              action={
                <Button variant="primary" onClick={openCreate}>
                  Add nozzle
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Tank</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNozzles.map((nozzle) => (
                    <TableRow key={nozzle.id}>
                      <TableCell className="font-medium">
                        {gradeLabel(nozzle.nozzleNumber)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={stateVariant(
                            nozzleStateMap.get(String(nozzle.id)) ??
                              nozzleStateMap.get(String(nozzle.nozzleNumber)) ??
                              'unknown',
                          )}
                        >
                          {formatState(
                            nozzleStateMap.get(String(nozzle.id)) ??
                              nozzleStateMap.get(String(nozzle.nozzleNumber)) ??
                              'unknown',
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>{nozzle.tankName}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {nozzle.productName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {nozzle.productCode}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => openEdit(nozzle)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => deleteNozzle(nozzle)}
                            disabled={isSaving}
                          >
                            Delete
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
            <SheetTitle>{form.id ? 'Edit nozzle' : 'Add nozzle'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <Input
              placeholder="Grade (Nozzle number)"
              type="number"
              value={form.nozzleNumber}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  nozzleNumber: event.target.value,
                }))
              }
            />
            {formErrors.nozzleNumber && (
              <p className="text-xs text-red-600">{formErrors.nozzleNumber}</p>
            )}

            <div className="space-y-2">
              <Input
                placeholder="Search tanks"
                value={tankSearch}
                onChange={(event) => setTankSearch(event.target.value)}
              />
              <Select
                value={form.tankId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tankId: event.target.value }))
                }
              >
                <option value="">Select tank</option>
                {filteredTanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.name} — {tank.productName} ({tank.productCode})
                  </option>
                ))}
              </Select>
              {formErrors.tankId && (
                <p className="text-xs text-red-600">{formErrors.tankId}</p>
              )}
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="secondary"
              onClick={() => setSheetOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={saveNozzle} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save nozzle'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
