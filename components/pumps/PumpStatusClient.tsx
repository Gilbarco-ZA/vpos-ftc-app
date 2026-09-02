'use client'

import type {
  BufferThresholds,
  ForecourtBufferPayload,
  PumpBufferHealth,
} from '@/components/pumps/pumpStatusTypes'
import type { PumpStateSnapshot } from '@/src/shared/pumps/types'
import { useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { FORECOURT_CONNECTION_STATUS } from '@/src/shared/status/ui'

import {
  forecourtBadge,
  useForecourtConnection,
} from '@/src/modules/forecourt/client/useForecourtConnection'

import {
  computeBufferSeverity,
  DEFAULT_THRESHOLDS,
  formatLastSeen,
  formatState,
  healthVariant,
  sevVariant,
  statusVariant,
} from '@/components/pumps/pumpStatusHelpers'
import { Badge } from '@/components/ui/badge'

type PumpStatusClientProps = {
  stationId: string
}

const PumpStatusClient = ({ stationId }: PumpStatusClientProps) => {
  const [snapshot, setSnapshot] = useState<PumpStateSnapshot | null>(null)
  const forecourtConn = useForecourtConnection(stationId)
  const [bufferHealth] = useState<ForecourtBufferPayload | null>(null)

  const thresholds: BufferThresholds = useMemo(
    () => ({
      ...DEFAULT_THRESHOLDS,
      ...(bufferHealth?.thresholds ?? {}),
    }),
    [bufferHealth?.thresholds],
  )

  useEffect(() => {
    let cancelled = false
    const loadFallback = async () => {
      try {
        const res: any = await api('/api/pumps/state')
        if (!cancelled && res.ok) {
          setSnapshot((prev) => {
            const next = res?.data?.liveState ?? null
            if (!next) return prev
            if (!prev || (prev.pumps?.length ?? 0) === 0) return next

            const prevHasLive = prev.pumps.some((pump) =>
              Boolean(pump.lastSeenAt),
            )
            const nextHasLive = next.pumps?.some((pump: any) =>
              Boolean(pump.lastSeenAt),
            )

            return prevHasLive && !nextHasLive ? prev : next
          })
        }
      } catch {}
    }

    loadFallback()
    const interval = setInterval(loadFallback, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const pumps = useMemo(() => snapshot?.pumps ?? [], [snapshot])
  const supBufMap = useMemo(() => {
    const m = new Map<number, PumpBufferHealth>()
    for (const e of bufferHealth?.supervised ?? []) m.set(e.pumpId, e)
    return m
  }, [bufferHealth])
  const unsupBufMap = useMemo(() => {
    const m = new Map<number, PumpBufferHealth>()
    for (const e of bufferHealth?.unsupervised ?? []) m.set(e.pumpId, e)
    return m
  }, [bufferHealth])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded border bg-[var(--surface-card)] p-4">
        <div>
          <h2 className="text-lg font-semibold">Pump States</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Live nozzle status.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <div>
              Forecourt last seen:{' '}
              <span className="font-medium text-[var(--text-secondary)]">
                {formatLastSeen(forecourtConn?.lastSeenAt)}
              </span>
            </div>
            <div>
              Reconnect attempts:{' '}
              <span className="font-medium text-[var(--text-secondary)]">
                {forecourtConn?.reconnectAttempts ?? 0}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={forecourtBadge(forecourtConn?.status).variant}>
            {forecourtBadge(forecourtConn?.status).label}
          </Badge>
        </div>
      </div>

      {forecourtBadge(forecourtConn?.status).label !== 'Online' && (
        <div className="rounded-card border border-border bg-surface-card p-4 text-xs text-[var(--text-secondary)]">
          Forecourt is {forecourtBadge(forecourtConn?.status).label}. Risky
          actions are disabled until the connection is restored.
        </div>
      )}

      {pumps.length === 0 ? (
        <div className="rounded border bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
          No pump state data yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pumps.map((pump) => (
            <div
              key={pump.pumpId}
              className="rounded border bg-[var(--surface-card)] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">
                    Pump {pump.pumpId}
                  </div>
                  <Badge variant={healthVariant(pump.health)}>
                    {pump.health === FORECOURT_CONNECTION_STATUS.OFFLINE
                      ? 'Offline'
                      : pump.health === FORECOURT_CONNECTION_STATUS.ONLINE
                        ? 'Online'
                        : 'Unknown'}
                  </Badge>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {new Date(pump.updatedAt).toLocaleTimeString()}
                </div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-2">
                <div className="rounded border bg-[var(--surface-card)] p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-[var(--text-secondary)]">
                      Supervised buffer
                    </div>
                    {(() => {
                      const h = supBufMap.get(Number(pump.pumpId))
                      if (!h) return null
                      const s = computeBufferSeverity({
                        depth: h.depth,
                        lastActionAt:
                          h.lastClearAt ?? h.lastReadAt ?? undefined,
                        actionLabel: 'clear',
                        warnDepth: thresholds.bufferWarnDepthSup,
                        critDepth: thresholds.bufferCritDepthSup,
                        warnAgeMs: thresholds.bufferWarnAgeMinSup * 60 * 1000,
                        critAgeMs: thresholds.bufferCritAgeMinSup * 60 * 1000,
                      })
                      return (
                        <Badge
                          variant={sevVariant(s.sev)}
                          className="text-[10px]"
                        >
                          {s.sev.toUpperCase()}
                        </Badge>
                      )
                    })()}
                  </div>
                  {(() => {
                    const h = supBufMap.get(Number(pump.pumpId))
                    if (!h)
                      return (
                        <div className="text-[var(--text-muted)]">No data</div>
                      )
                    return (
                      <div className="mt-1 space-y-1">
                        <div>
                          Depth:{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.depth}
                          </span>
                          {h.lastSeqNo != null ? (
                            <>
                              {' '}
                              • Last seq:{' '}
                              <span className="font-medium text-[var(--text-primary)]">
                                {h.lastSeqNo}
                              </span>
                            </>
                          ) : null}
                        </div>
                        <div>
                          Last read:{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.lastReadAt
                              ? new Date(h.lastReadAt).toLocaleTimeString()
                              : '—'}
                          </span>{' '}
                          • Last clear:{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.lastClearAt
                              ? new Date(h.lastClearAt).toLocaleTimeString()
                              : '—'}
                          </span>
                        </div>
                        {h.lastError ? (
                          <div className="text-amber-700">
                            Last error: {h.lastError}
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
                <div className="rounded border bg-[var(--surface-card)] p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-[var(--text-secondary)]">
                      Unsupervised buffer
                    </div>
                    {(() => {
                      const h = unsupBufMap.get(Number(pump.pumpId))
                      if (!h) return null
                      const s = computeBufferSeverity({
                        depth: h.depth,
                        lastActionAt: h.lastReadAt ?? Date.now(),
                        actionLabel: 'read',
                        warnDepth: thresholds.bufferWarnDepthUnsup,
                        critDepth: thresholds.bufferCritDepthUnsup,
                        warnAgeMs: thresholds.bufferWarnAgeMinUnsup * 60 * 1000,
                        critAgeMs: thresholds.bufferCritAgeMinUnsup * 60 * 1000,
                      })
                      return (
                        <Badge
                          variant={sevVariant(s.sev)}
                          className="text-[10px]"
                        >
                          {s.sev.toUpperCase()}
                        </Badge>
                      )
                    })()}
                  </div>
                  {(() => {
                    const h = unsupBufMap.get(Number(pump.pumpId))
                    if (!h)
                      return (
                        <div className="text-[var(--text-muted)]">No data</div>
                      )
                    return (
                      <div className="mt-1 space-y-1">
                        <div>
                          Depth:{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.depth}
                          </span>
                          {h.lastSeqNo != null ? (
                            <>
                              {' '}
                              • Last seq:{' '}
                              <span className="font-medium text-[var(--text-primary)]">
                                {h.lastSeqNo}
                              </span>
                            </>
                          ) : null}
                        </div>
                        <div>
                          Last read:{' '}
                          <span className="font-medium text-[var(--text-primary)]">
                            {h.lastReadAt
                              ? new Date(h.lastReadAt).toLocaleTimeString()
                              : '—'}
                          </span>
                        </div>
                        {h.lastError ? (
                          <div className="text-amber-700">
                            Last error: {h.lastError}
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div className="space-y-2">
                {pump.nozzles.map((nozzle) => (
                  <div
                    key={nozzle.nozzleId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                  >
                    <div className="text-sm font-medium">
                      Nozzle {nozzle.nozzleId}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {nozzle.fuelType || 'Unknown fuel'}
                    </div>
                    <Badge variant={statusVariant(nozzle.state)}>
                      {formatState(nozzle.state)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PumpStatusClient
