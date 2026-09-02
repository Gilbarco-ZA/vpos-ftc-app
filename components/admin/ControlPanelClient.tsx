'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Skeleton } from '@/components/ui/skeleton'

type ControlStatus = any
type ControlEvent = any

async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  })
  const data = await safeAsync(res.json(), 'controlPanel.parseJson')
  if (!res.ok)
    throw new Error(
      data?.error || data?.message || `Request failed: ${res.status}`,
    )
  return data
}

export const ControlPanelClient = () => {
  const [status, setStatus] = useState<ControlStatus | null>(null)
  const [events, setEvents] = useState<ControlEvent[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, e] = await Promise.all([
        jsonFetch('/api/control/status', { cache: 'no-store' as any }),
        jsonFetch('/api/control/events?limit=100', {
          cache: 'no-store' as any,
        }),
      ])
      setStatus(s?.data ?? null)
      setEvents(e?.data ?? [])
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      refresh().catch((e) => setError(e?.message ?? String(e)))
    })
  }, [refresh])

  const run = async (cmd: 'restart' | 'reload-config') => {
    setBusy(cmd)
    setError(null)
    try {
      await jsonFetch(`/api/control/control/${cmd}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'admin-ui' }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const processRows = useMemo(() => {
    const p = status?.processes ?? {}
    return Object.entries(p).map(([name, val]: any) => ({
      name,
      ...(val ?? {}),
    }))
  }, [status])

  const showInitialLoading = loading && !hasLoaded

  return (
    <div className="space-y-6">
      {error && <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert>}

      <div className="space-y-3 rounded border bg-[var(--surface-card)] p-4">
        <h2 className="font-semibold">Commands</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!!busy}
            onClick={() => run('reload-config')}
          >
            {busy === 'reload-config' ? 'Reloading…' : 'Reload Config'}
          </Button>
          <Button
            variant="destructive"
            disabled={!!busy}
            onClick={() => run('restart')}
          >
            {busy === 'restart' ? 'Restarting…' : 'Restart Supervisor'}
          </Button>

          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => refresh()}
          >
            Refresh
          </Button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Note: commands are logged into <code>process_control_events</code>.
        </p>
      </div>

      <div className="relative rounded border bg-[var(--surface-card)] p-4">
        {loading && hasLoaded ? (
          <LoadingOverlay label="Refreshing supervisor status…" />
        ) : null}
        <h2 className="mb-3 font-semibold">Supervisor Status</h2>

        {showInitialLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((__, cellIndex) => (
                  <Skeleton key={cellIndex} className="h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-[var(--surface-muted)] text-left">
                  <th className="p-2">Process</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Connected</th>
                  <th className="p-2">PID</th>
                  <th className="p-2">Last Check</th>
                  <th className="p-2">Restarts</th>
                </tr>
              </thead>
              <tbody>
                {processRows.map((r: any) => (
                  <tr key={r.name} className="border-b">
                    <td className="p-2 font-mono text-xs">{r.name}</td>
                    <td className="p-2">{String(r.status ?? '')}</td>
                    <td className="p-2">{r.connected ? 'yes' : 'no'}</td>
                    <td className="p-2">{r.pid ?? ''}</td>
                    <td className="p-2">
                      {r.lastHealthCheck
                        ? new Date(r.lastHealthCheck).toLocaleString()
                        : ''}
                    </td>
                    <td className="p-2">{r.restartCount ?? 0}</td>
                  </tr>
                ))}
                {processRows.length === 0 && (
                  <tr>
                    <td className="p-2 text-[var(--text-muted)]" colSpan={6}>
                      No processes reported.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-[var(--text-secondary)]">
            Raw JSON
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(status, null, 2)}
          </pre>
        </details>
      </div>

      <div className="relative rounded border bg-[var(--surface-card)] p-4">
        {loading && hasLoaded ? (
          <LoadingOverlay label="Refreshing control events…" />
        ) : null}
        <h2 className="mb-3 font-semibold">Recent Control Events</h2>
        {showInitialLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((__, cellIndex) => (
                  <Skeleton key={cellIndex} className="h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-[var(--surface-muted)] text-left">
                  <th className="p-2">When</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Target</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e: any) => (
                  <tr key={e.id} className="border-b">
                    <td className="p-2">
                      {e.created_at
                        ? new Date(e.created_at).toLocaleString()
                        : ''}
                    </td>
                    <td className="p-2 font-mono text-xs">{e.action}</td>
                    <td className="p-2 font-mono text-xs">
                      {e.target_process ?? ''}
                    </td>
                    <td className="p-2">{e.status}</td>
                    <td className="p-2 text-xs text-red-700">
                      {e.error_message ?? ''}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td className="p-2 text-[var(--text-muted)]" colSpan={5}>
                      No events found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-[var(--text-secondary)]">
            Raw JSON
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(events, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}
