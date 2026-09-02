'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const fmtAge = (value: unknown) => {
  const ageMs = Number(value)
  if (!Number.isFinite(ageMs)) return '—'
  if (ageMs < 1_000) return `${Math.max(0, Math.round(ageMs))}ms`
  if (ageMs < 60_000) return `${Math.round(ageMs / 1_000)}s`
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`
  return `${Math.round(ageMs / 3_600_000)}h`
}

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const ts =
    typeof value === 'number' ? value : new Date(String(value)).getTime()
  if (!Number.isFinite(ts)) return String(value)
  return new Date(ts).toLocaleString()
}

const badgeVariantForHealth = (status?: string) => {
  switch (String(status ?? '').toLowerCase()) {
    case 'healthy':
    case 'online':
    case 'connected':
      return STATUS_VARIANT.SUCCESS
    case 'offline':
    case 'critical':
    case 'error':
      return STATUS_VARIANT.ERROR
    case 'degraded':
    case 'warn':
    case 'warning':
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.INFO
  }
}

const msSinceTimestamp = (value: unknown) => {
  const ts = Number(value)
  return Number.isFinite(ts) ? Date.now() - ts : null
}

const eventSummary = (event: any) => {
  const payload = event?.payload ?? {}
  return (
    payload?.RejectInfoText ??
    payload?.rejectInfoText ??
    payload?.message ??
    payload?.action ??
    event?.event_type ??
    'event'
  )
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]">
        {value == null || value === '' ? '—' : String(value)}
      </div>
    </div>
  )
}

export function JplDiagnosticsPanel() {
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>('/api/admin/forecourt/diagnostics')
      if (!response.success) {
        throw new Error(response.error || 'Failed to load diagnostics')
      }
      setPayload(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load diagnostics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const protocol = payload?.adapterState?.protocol ?? payload?.protocol ?? {}
  const protocolHealth =
    payload?.adapterState?.protocolHealth ??
    payload?.protocolHealth ??
    protocol?.protocolHealth ??
    {}
  const issues = Array.isArray(protocolHealth?.issues)
    ? protocolHealth.issues
    : []
  const recentRejects = payload?.recent?.rejects ?? []
  const recentProtocolEvents = payload?.recent?.protocolEvents ?? []

  const heartbeatAge = useMemo(() => {
    const ts = payload?.adapterState?.lastHeartbeatAt
    if (!ts) return null
    return msSinceTimestamp(ts)
  }, [payload?.adapterState?.lastHeartbeatAt])

  const messageAge = useMemo(() => {
    const ts = payload?.adapterState?.lastMessageAt
    if (!ts) return payload?.connection?.ageMs ?? null
    return msSinceTimestamp(ts)
  }, [payload?.adapterState?.lastMessageAt, payload?.connection?.ageMs])

  return (
    <CollapsibleStatusSection
      title="JPL diagnostics"
      status={protocolHealth?.status ?? 'unknown'}
      statusVariant={badgeVariantForHealth(protocolHealth?.status)}
      contentClassName="p-0"
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">JPL diagnostics</div>
              <div className="text-xs text-[var(--text-secondary)]">
                Protocol health, heartbeat freshness, correlation mode, and
                recent rejects.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={badgeVariantForHealth(protocolHealth?.status)}>
                {protocolHealth?.status ?? 'unknown'}
              </Badge>
              <Button onClick={load} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh diagnostics'}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Metric label="Connection" value={payload?.connection?.status} />
            <Metric
              label="Connected"
              value={payload?.connection?.connected ? 'yes' : 'no'}
            />
            <Metric label="Last message age" value={fmtAge(messageAge)} />
            <Metric label="Last heartbeat age" value={fmtAge(heartbeatAge)} />
            <Metric
              label="JPL version"
              value={
                protocol?.version ?? payload?.adapterState?.protocolVersion
              }
            />
            <Metric
              label="Secure transport"
              value={protocol?.secureMode ? 'yes' : 'no'}
            />
            <Metric
              label="Correlation"
              value={
                protocol?.correlationCapability ??
                String(protocol?.correlationSupport ?? 'unknown')
              }
            />
            <Metric
              label="Request mode"
              value={protocol?.requestMode ?? protocol?.requestDispatchMode}
            />
          </div>

          {issues.length ? (
            <div className="space-y-2 rounded border bg-[var(--surface-card)] p-3">
              <div className="text-sm font-semibold">Protocol issues</div>
              <div className="space-y-2">
                {issues.map((issue: any, index: number) => (
                  <div
                    key={`${issue?.code ?? 'issue'}-${index}`}
                    className="flex flex-wrap items-start gap-2 text-sm"
                  >
                    <Badge variant={badgeVariantForHealth(issue?.severity)}>
                      {issue?.severity ?? 'warn'}
                    </Badge>
                    <div>
                      <span className="font-medium">
                        {issue?.code ?? 'issue'}:
                      </span>{' '}
                      <span className="text-[var(--text-secondary)]">
                        {issue?.message ?? ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded border bg-[var(--surface-card)] p-3 text-sm text-[var(--text-secondary)]">
              No protocol health issues currently reported.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">Controller flags</div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                {JSON.stringify(
                  payload?.adapterState?.controllerFlags ??
                    payload?.controllerFlags ??
                    {},
                  null,
                  2,
                )}
              </pre>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Subscriptions and dispatch
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                {JSON.stringify(
                  {
                    defaultSubscriptions: protocolHealth?.defaultSubscriptions,
                    requestDispatchPolicy: protocol?.requestDispatchPolicy,
                    requestDispatchMode: protocol?.requestDispatchMode,
                    rawFrameDiagnosticsEnabled:
                      protocolHealth?.rawFrameDiagnosticsEnabled,
                    lastDisconnectReason:
                      payload?.adapterState?.lastDisconnectReason,
                    nextReconnectAt: fmtTs(
                      payload?.adapterState?.nextReconnectAt,
                    ),
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  Recent protocol rejects
                </div>
                <Badge
                  variant={
                    recentRejects.length
                      ? STATUS_VARIANT.ERROR
                      : STATUS_VARIANT.SUCCESS
                  }
                >
                  {recentRejects.length}
                </Badge>
              </div>
              {recentRejects.length ? (
                <div className="space-y-2">
                  {recentRejects.slice(0, 8).map((event: any) => (
                    <div
                      key={event.id}
                      className="border-b pb-2 text-xs last:border-b-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{event.event_type}</span>
                        <span className="text-[var(--text-muted)]">
                          {fmtTs(event.occurred_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-[var(--text-secondary)]">
                        {eventSummary(event)}
                      </div>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] text-[var(--text-muted)]">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">
                  No persisted rejects found.
                </div>
              )}
            </div>

            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Recent JPL events
              </div>
              {recentProtocolEvents.length ? (
                <div className="space-y-2">
                  {recentProtocolEvents.slice(0, 10).map((event: any) => (
                    <div
                      key={event.id}
                      className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 text-xs last:border-b-0"
                    >
                      <div>
                        <div className="font-medium">{event.event_type}</div>
                        <div className="text-[var(--text-secondary)]">
                          {eventSummary(event)}
                        </div>
                      </div>
                      <div className="text-[var(--text-muted)]">
                        {fmtTs(event.occurred_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">
                  No persisted JPL events found.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </CollapsibleStatusSection>
  )
}
