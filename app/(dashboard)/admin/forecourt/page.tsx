'use client'

import type { ForecourtEventRow } from '@/src/modules/forecourt/contracts/admin'
import type {
  BufferSeverity,
  ForecourtConnectionStatus,
} from '@/src/shared/status/ui'
import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'

import { api } from '@/src/shared/api/fetch'
import {
  BufferThresholds,
  computeBufferSeverity,
  DEFAULT_BUFFER_THRESHOLDS,
  PumpBufferHealth,
} from '@/src/shared/forecourt/bufferSeverity'
import {
  BUFFER_SEVERITY,
  FORECOURT_CONNECTION_STATUS,
  STATUS_VARIANT,
} from '@/src/shared/status/ui'

import {
  forecourtBadge,
  useForecourtConnection,
} from '@/src/modules/forecourt/client/useForecourtConnection'

import { JplCommissioningReadinessPanel } from '@/components/admin/forecourt/JplCommissioningReadinessPanel'
import { JplDiagnosticsPanel } from '@/components/admin/forecourt/JplDiagnosticsPanel'
import { JplFieldValidationPanel } from '@/components/admin/forecourt/JplFieldValidationPanel'
import { JplMaintenanceExecutionGatePanel } from '@/components/admin/forecourt/JplMaintenanceExecutionGatePanel'
import { JplMaintenanceGatePanel } from '@/components/admin/forecourt/JplMaintenanceGatePanel'
import { JplMaintenancePlanPanel } from '@/components/admin/forecourt/JplMaintenancePlanPanel'
import { JplMaintenancePreviewPanel } from '@/components/admin/forecourt/JplMaintenancePreviewPanel'
import { JplOperationalReadinessPanel } from '@/components/admin/forecourt/JplOperationalReadinessPanel'
import { JplProductionControls } from '@/components/admin/forecourt/JplProductionControls'
import { JplReconciliationPanel } from '@/components/admin/forecourt/JplReconciliationPanel'
import { JplSupportBundlePanel } from '@/components/admin/forecourt/JplSupportBundlePanel'
import { JplWorkflowReviewPanel } from '@/components/admin/forecourt/JplWorkflowReviewPanel'
import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ApiResponse = {
  stationId: string
  limit: number
  filters: {
    source?: string | null
    eventType?: string | null
    pumpId?: string | null
    action?: string | null
  }
  data: ForecourtEventRow[]
  live?: {
    enabled: boolean
    limit: number
    data: any[]
  }
}

type LiveItem = {
  ts: number
  type: string
  data: any
}

type ForecourtBufferPayload = {
  stationId: string
  updatedAt: number
  supervised: PumpBufferHealth[]
  unsupervised: PumpBufferHealth[]
  thresholds?: Partial<BufferThresholds>
}

const DEFAULT_THRESHOLDS: BufferThresholds = { ...DEFAULT_BUFFER_THRESHOLDS }

const sevVariant = (sev: BufferSeverity) => {
  switch (sev) {
    case BUFFER_SEVERITY.CRIT:
      return STATUS_VARIANT.ERROR
    case BUFFER_SEVERITY.WARN:
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.INFO
  }
}

const worstSev = (sevs: BufferSeverity[]): BufferSeverity => {
  if (sevs.includes(BUFFER_SEVERITY.CRIT)) return BUFFER_SEVERITY.CRIT
  if (sevs.includes(BUFFER_SEVERITY.WARN)) return BUFFER_SEVERITY.WARN
  return BUFFER_SEVERITY.OK
}

const fmtTs = (v: string | number) => {
  try {
    const d = typeof v === 'number' ? new Date(v) : new Date(v)
    return d.toISOString().replace('T', ' ').replace('Z', '')
  } catch {
    return String(v)
  }
}

const badgeForType = (t: string) => {
  const s = (t || '').toLowerCase()
  if (s.includes('timeout')) {
    return <Badge variant={STATUS_VARIANT.ERROR}>timeout</Badge>
  }
  if (s.includes('confirmed')) {
    return <Badge variant={STATUS_VARIANT.SUCCESS}>confirmed</Badge>
  }
  if (s.includes('command')) {
    return <Badge variant={STATUS_VARIANT.NEUTRAL}>command</Badge>
  }
  return <Badge variant={STATUS_VARIANT.INFO}>{t}</Badge>
}

export default function AdminForecourtPage() {
  const [rows, setRows] = useState<ForecourtEventRow[]>([])
  const [err, setErr] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const [eventTypes, setEventTypes] = useState<string>(
    'command_confirmed,command_timeout',
  )
  const [pumpId, setPumpId] = useState<string>('')
  const [action, setAction] = useState<string>('')
  const [source, setSource] = useState<string>('ftc')
  const [limit, setLimit] = useState<number>(200)

  const [live, setLive] = useState<LiveItem[]>([])
  const [bufferHealth, setBufferHealth] =
    useState<ForecourtBufferPayload | null>(null)

  const stationId = useMemo(
    () =>
      typeof window !== 'undefined'
        ? String((window as any).__stationId || '')
        : '',
    [],
  )

  const forecourtConn = useForecourtConnection(stationId)

  const thresholds: BufferThresholds = useMemo(
    () => ({
      ...DEFAULT_THRESHOLDS,
      ...(bufferHealth?.thresholds ?? {}),
    }),
    [bufferHealth?.thresholds],
  )

  const query = useMemo(() => {
    const q = new URLSearchParams()
    q.set('limit', String(limit))
    if (source) q.set('source', source)
    if (eventTypes) q.set('eventType', eventTypes)
    if (pumpId) q.set('pumpId', pumpId)
    if (action) q.set('action', action)
    q.set('includeLive', 'false')
    return q.toString()
  }, [eventTypes, pumpId, action, source, limit])

  const refresh = async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await api<ApiResponse>(`/api/admin/forecourt/events?${query}`)

      if ((res as any)?.error) {
        throw new Error(
          (res as any).error?.message || 'Failed to load forecourt events',
        )
      }

      const payload = (res as any).data as ApiResponse
      setRows(payload?.data ?? [])
    } catch (e: any) {
      setErr(e?.message || 'Failed to load forecourt events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: '/ws/forecourt',
      transports: ['websocket'],
      upgrade: false,
      query: stationId ? { stationId } : undefined,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    })

    socket.on('message', (payload: any) => {
      if (!payload || typeof payload !== 'object') return

      const t = payload.type

      if (t === 'forecourt:buffer') {
        setBufferHealth(payload.data as ForecourtBufferPayload)
        return
      }

      if (
        t === 'cmd:confirmed' ||
        t === 'cmd:timeout' ||
        t === 'cmd:result' ||
        String(t || '').startsWith('jpl.')
      ) {
        setLive((prev) => {
          const next: LiveItem[] = [
            { ts: Date.now(), type: t, data: payload.data },
            ...prev,
          ]
          return next.slice(0, 50)
        })
      }
    })

    return () => {
      try {
        socket.disconnect()
      } catch {}
    }
  }, [stationId])

  const filteredRows = useMemo(() => {
    return rows
  }, [rows])

  return (
    <div className="space-y-4">
      <CsrfBootstrap />
      <PageHeader
        title="Forecourt"
        description="Command confirmations, timeouts, and forecourt event audit trail"
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Forecourt connection</div>
            <Badge variant={forecourtBadge(forecourtConn?.status).variant}>
              {forecourtBadge(forecourtConn?.status).label}
            </Badge>
          </div>

          <div className="text-xs text-[var(--text-secondary)]">
            Last seen:{' '}
            {forecourtConn?.lastSeenAt
              ? new Date(forecourtConn.lastSeenAt).toLocaleTimeString()
              : '—'}{' '}
            • Reconnect attempts: {forecourtConn?.reconnectAttempts ?? 0}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Supervised buffer</div>
                {(() => {
                  const now = Date.now()
                  const sevs = (bufferHealth?.supervised ?? []).map((h) =>
                    computeBufferSeverity('supervised', h, thresholds, now),
                  )
                  const s = worstSev(sevs)
                  return (
                    <Badge variant={sevVariant(s)}>{s.toUpperCase()}</Badge>
                  )
                })()}
              </div>

              {bufferHealth?.supervised?.length ? (
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                  {bufferHealth.supervised
                    .slice()
                    .sort((a, b) => a.pumpId - b.pumpId)
                    .map((h) => (
                      <div
                        key={`sup-${h.pumpId}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2">
                            <div>Pump {h.pumpId}</div>
                            {(() => {
                              const s = computeBufferSeverity(
                                'unsupervised',
                                h,
                                thresholds,
                                Date.now(),
                              )
                              return (
                                <Badge
                                  variant={sevVariant(s)}
                                  className="text-[10px]"
                                >
                                  {s.toUpperCase()}
                                </Badge>
                              )
                            })()}
                          </div>

                          {(() => {
                            const s = computeBufferSeverity(
                              'supervised',
                              h,
                              thresholds,
                              Date.now(),
                            )
                            return (
                              <Badge
                                variant={sevVariant(s)}
                                className="text-[10px]"
                              >
                                {s.toUpperCase()}
                              </Badge>
                            )
                          })()}
                        </div>

                        <div className="text-[var(--text-secondary)]">
                          depth{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.depth}
                          </span>
                          {h.lastClearAt ? (
                            <>
                              {' '}
                              • cleared{' '}
                              {new Date(h.lastClearAt).toLocaleTimeString()}
                            </>
                          ) : null}
                          {h.lastError ? (
                            <>
                              {' '}
                              • <span className="text-amber-700">err</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)]">No data</div>
              )}
            </div>

            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Unsupervised buffer</div>
                {(() => {
                  const now = Date.now()
                  const sevs = (bufferHealth?.unsupervised ?? []).map((h) =>
                    computeBufferSeverity('unsupervised', h, thresholds, now),
                  )
                  const s = worstSev(sevs)
                  return (
                    <Badge variant={sevVariant(s)}>{s.toUpperCase()}</Badge>
                  )
                })()}
              </div>

              {bufferHealth?.unsupervised?.length ? (
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                  {bufferHealth.unsupervised
                    .slice()
                    .sort((a, b) => a.pumpId - b.pumpId)
                    .map((h) => (
                      <div
                        key={`unsup-${h.pumpId}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>Pump {h.pumpId}</div>
                        <div className="text-[var(--text-secondary)]">
                          depth{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.depth}
                          </span>
                          {h.lastReadAt ? (
                            <>
                              {' '}
                              • read{' '}
                              {new Date(h.lastReadAt).toLocaleTimeString()}
                            </>
                          ) : null}
                          {h.lastError ? (
                            <>
                              {' '}
                              • <span className="text-amber-700">err</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)]">No data</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <JplDiagnosticsPanel />

      <JplOperationalReadinessPanel />

      <JplCommissioningReadinessPanel />

      <JplProductionControls />

      <JplWorkflowReviewPanel />

      <JplReconciliationPanel />

      <JplMaintenancePlanPanel />

      <JplMaintenanceGatePanel />

      <JplMaintenancePreviewPanel />

      <JplMaintenanceExecutionGatePanel />

      <JplFieldValidationPanel />

      <JplSupportBundlePanel />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <div className="mb-1 text-sm">Event types</div>
              <Input
                value={eventTypes}
                onChange={(e) => setEventTypes(e.target.value)}
                placeholder="command_confirmed,command_timeout"
              />
            </div>

            <div>
              <div className="mb-1 text-sm">Pump</div>
              <Input
                value={pumpId}
                onChange={(e) => setPumpId(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>

            <div>
              <div className="mb-1 text-sm">Action</div>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="e.g. AUTHORIZE"
              />
            </div>

            <div>
              <div className="mb-1 text-sm">Source</div>
              <Select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="ftc">ftc</option>
                <option value="doms">doms</option>
                <option value="">(any)</option>
              </Select>
            </div>

            <div>
              <div className="mb-1 text-sm">Limit</div>
              <Input
                value={String(limit)}
                onChange={(e) =>
                  setLimit(
                    Math.max(1, Math.min(500, Number(e.target.value || 0))),
                  )
                }
                placeholder="200"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={refresh} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
            <div className="text-muted-foreground text-sm">
              Showing {filteredRows.length} rows
            </div>
          </div>

          {err ? (
            <ErrorDetails title="Error" message={err} error={err} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 font-medium">Live command feed (last 50)</div>
          <div className="space-y-2">
            {live.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No live events yet.
              </div>
            ) : (
              live.map((it, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 border-b pb-2"
                >
                  <div className="text-muted-foreground min-w-[220px] text-sm">
                    {fmtTs(it.ts)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {badgeForType(it.type)}
                      <span className="text-sm font-medium">
                        {it.data?.action || it.data?.type || ''}
                      </span>
                      {it.data?.pumpId ? (
                        <Badge variant={STATUS_VARIANT.NEUTRAL}>
                          pump {it.data.pumpId}
                        </Badge>
                      ) : null}
                    </div>
                    <pre className="text-muted-foreground mt-1 whitespace-pre-wrap break-words text-xs">
                      {JSON.stringify(it.data, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 font-medium">
            Audit log (Postgres: forecourt_events)
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Pump</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtTs(r.occurred_at)}
                  </TableCell>
                  <TableCell>{badgeForType(r.event_type)}</TableCell>
                  <TableCell className="text-sm">
                    {typeof r.payload?.action === 'string'
                      ? r.payload.action
                      : ''}
                  </TableCell>
                  <TableCell className="text-sm">
                    {typeof r.payload?.pumpId === 'string' ||
                    typeof r.payload?.pumpId === 'number'
                      ? String(r.payload.pumpId)
                      : ''}
                  </TableCell>
                  <TableCell className="text-sm">{r.source}</TableCell>
                  <TableCell>
                    <pre className="text-muted-foreground max-w-[520px] whitespace-pre-wrap break-words text-xs">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  </TableCell>
                </TableRow>
              ))}

              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground text-sm"
                  >
                    No matching events.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
