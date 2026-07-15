'use client'

import { useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Overview = any

function fmtBytes(n: number) {
  if (!Number.isFinite(n)) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`
}

export default function DiagnosticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [err, setErr] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [logType, setLogType] = useState<'live' | 'archive' | 'restart'>('live')
  const [logs, setLogs] = useState<any[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [selectedLogName, setSelectedLogName] = useState<string>('')
  const [selectedLogContent, setSelectedLogContent] = useState<string>('')
  const [restartLog, setRestartLog] = useState<string>('')
  const [clearingLogs, setClearingLogs] = useState<boolean>(false)

  const selectedNames = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  )

  const loadAll = async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await api<Overview>('/api/admin/diagnostics/overview', {
        cache: 'no-store',
      })
      if (!res.success) throw new Error(res.error || 'Failed to load overview')
      setOverview(res.data ?? null)
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (type: 'live' | 'archive' | 'restart') => {
    setErr('')
    try {
      const url =
        type === 'archive'
          ? '/api/admin/logs/archive'
          : `/api/admin/logs?type=${type}`
      const res = await api<any[]>(url, { cache: 'no-store' })
      if (!res.success) throw new Error(res.error || 'Failed to load logs')
      const nextLogs = Array.isArray(res.data) ? res.data : []
      setLogs(nextLogs)
      setSelected({})
      const preferred = nextLogs.find((entry: any) =>
        ['doms-jpl.log', 'application.log'].includes(
          String(entry?.filename || ''),
        ),
      )
      const firstFilename = String(
        preferred?.filename || nextLogs?.[0]?.filename || '',
      )
      setSelectedLogName(firstFilename)
      if (firstFilename) {
        await loadLogContent(type, firstFilename)
      } else {
        setSelectedLogContent('')
      }
    } catch (e: any) {
      setErr(String(e?.message || e))
    }
  }

  const loadLogContent = async (
    type: 'live' | 'archive' | 'restart',
    filename: string,
  ) => {
    if (!filename) {
      setSelectedLogName('')
      setSelectedLogContent('')
      return
    }

    setErr('')
    try {
      const params = new URLSearchParams({
        type,
        filename,
        lines: '1000',
      })
      const res = await api<any>(`/api/logs/content?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.success)
        throw new Error(res.error || 'Failed to load log content')
      setSelectedLogName(filename)
      setSelectedLogContent(String(res.data?.content || ''))
    } catch (e: any) {
      setErr(String(e?.message || e))
    }
  }

  const loadRestartLog = async () => {
    setErr('')
    try {
      const res = await api<any>('/api/vpos/restart-log-content', {
        cache: 'no-store',
      })
      if (!res.success)
        throw new Error(res.error || 'Failed to load restart log')

      const payload = res.data
      if (typeof payload === 'string') {
        setRestartLog(payload)
      } else {
        // Maintain existing defensive behavior
        setRestartLog(String((payload as any)?.data || ''))
      }
    } catch (e: any) {
      setErr(String(e?.message || e))
    }
  }

  const downloadSelectedLogs = async () => {
    if (!selectedNames.length) return
    setErr('')
    try {
      // api() always parses JSON, but this endpoint returns a ZIP blob.
      // So we use fetch here intentionally.
      const res = await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: logType, filenames: selectedNames }),
      })
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${logType}-logs.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setErr(String(e?.message || e))
    }
  }

  const clearSelectedLogs = async () => {
    if (!selectedNames.length) return
    if (
      !window.confirm(
        `Clear ${selectedNames.length} selected log(s) from the database?`,
      )
    ) {
      return
    }

    setClearingLogs(true)
    setErr('')
    try {
      const res = await api('/api/admin/logs/clear', {
        method: 'POST',
        body: JSON.stringify({ type: logType, filenames: selectedNames }),
      })
      if (!res.success) throw new Error(res.error || 'Failed to clear logs')
      await loadLogs(logType)
      if (logType === 'restart') {
        await loadRestartLog()
      }
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setClearingLogs(false)
    }
  }

  const clearRestartLog = async () => {
    setErr('')
    try {
      const res = await api('/api/vpos/restart-log-clear', {
        method: 'POST',
      })
      if (!res.success)
        throw new Error(res.error || 'Failed to clear restart log')
      await loadRestartLog()
    } catch (e: any) {
      setErr(String(e?.message || e))
    }
  }

  useEffect(() => {
    loadAll()
    loadLogs('live')
    loadRestartLog()
  }, [])

  useEffect(() => {
    loadLogs(logType)
  }, [logType])

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Diagnostics"
        description="Station health, counters, logs, restart history, and raw DOMS/JPL communication."
        actions={
          <Button variant="secondary" onClick={loadAll} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {err ? (
        <Card>
          <CardContent>
            <div className="text-sm text-red-600">{err}</div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-1">
            <h2 className="font-medium">App</h2>
            <div className="space-y-1 text-sm">
              <div>Version: {overview?.app?.version || '-'}</div>
              <div>Node: {overview?.app?.node || '-'}</div>
              <div>PID: {overview?.app?.pid || '-'}</div>
              <div>Started: {overview?.app?.startedAt || '-'}</div>
              <div>Uptime: {overview?.app?.uptimeSeconds ?? '-'}s</div>
              <div>DB: {overview?.db?.ok ? 'OK' : 'NOT OK'}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1">
            <h2 className="font-medium">Machine</h2>
            <div className="space-y-1 text-sm">
              <div>Host: {overview?.machine?.hostname || '-'}</div>
              <div>Platform: {overview?.machine?.platform || '-'}</div>
              <div>CPU: {overview?.machine?.cpus ?? '-'} cores</div>
              <div>
                Load:{' '}
                {Array.isArray(overview?.machine?.load)
                  ? overview.machine.load.map((x: any) => String(x)).join(', ')
                  : '-'}
              </div>
              <div>
                Memory: {fmtBytes(overview?.machine?.mem?.free)} free /{' '}
                {fmtBytes(overview?.machine?.mem?.total)} total
              </div>
              <div>Uptime: {overview?.machine?.uptimeSeconds ?? '-'}s</div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">Operational counters</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatCard
              label="Transactions pending customer"
              value={overview?.counters?.transactionsPendingCustomer ?? '0'}
            />
            <div className="rounded-card border p-3 lg:col-span-2">
              <div className="text-sm opacity-70">Transactions by status</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {(Array.isArray(overview?.counters?.transactionsByStatus)
                  ? overview.counters.transactionsByStatus
                  : []
                ).map((r: any) => (
                  <div key={r.status} className="flex justify-between">
                    <span>{r.status}</span>
                    <span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-card border p-3 lg:col-span-3">
              <div className="text-sm opacity-70">Print jobs by status</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm lg:grid-cols-4">
                {(Array.isArray(overview?.counters?.printJobsByStatus)
                  ? overview.counters.printJobsByStatus
                  : []
                ).map((r: any) => (
                  <div key={r.status} className="flex justify-between">
                    <span>{r.status}</span>
                    <span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Logs</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={logType}
                onChange={(e) => setLogType(e.target.value as any)}
              >
                <option value="live">Live</option>
                <option value="archive">Archive</option>
                <option value="restart">Restart</option>
              </Select>
              <Button variant="secondary" onClick={() => loadLogs(logType)}>
                Refresh logs
              </Button>
              <Button
                variant="secondary"
                disabled={!selectedNames.length || clearingLogs}
                onClick={downloadSelectedLogs}
              >
                Download selected
              </Button>
              <Button
                variant="destructive"
                disabled={!selectedNames.length || clearingLogs}
                onClick={clearSelectedLogs}
              >
                {clearingLogs ? 'Clearing…' : 'Clear selected from DB'}
              </Button>
              <Button
                variant="secondary"
                disabled={!selectedLogName}
                onClick={() => {
                  if (!selectedLogName) return
                  const params = new URLSearchParams({
                    type: logType,
                    filename: selectedLogName,
                    lines: '2000',
                  })
                  window.open(
                    `/api/admin/logs/view?${params.toString()}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }}
              >
                Open via API
              </Button>
            </div>
          </div>

          <div className="overflow-auto rounded-card border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sel</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l: any) => (
                  <TableRow
                    key={l.filename}
                    className={
                      selectedLogName === l.filename ? 'bg-muted/40' : ''
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={!!selected[l.filename]}
                        onChange={(e) =>
                          setSelected((s) => ({
                            ...s,
                            [l.filename]: e.target.checked,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 py-0 font-normal underline-offset-2 hover:underline"
                        onClick={() => loadLogContent(logType, l.filename)}
                      >
                        {l.filename}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono">
                      {fmtBytes(Number(l.size || 0))}
                    </TableCell>
                    <TableCell className="font-mono">
                      {l.updated_at ?? l.created_at ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {logType === 'archive' ? (
            <p className="text-xs text-[var(--text-muted)]">
              Archive listing uses the server default date range parsing
              (console compatible).
            </p>
          ) : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">
              {selectedLogName ? `Preview: ${selectedLogName}` : 'Preview'}
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-card border border-border bg-surface-muted p-3 text-xs">
              {selectedLogContent || '(select a log to preview)'}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Restart log</h2>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={loadRestartLog}>
                Refresh
              </Button>
              <Button variant="secondary" onClick={clearRestartLog}>
                Clear
              </Button>
            </div>
          </div>
          <pre className="max-h-[360px] overflow-auto rounded-card border border-border bg-surface-muted p-3 text-xs">
            {restartLog || '(empty)'}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">Control events (last 25)</h2>
          <div className="overflow-auto rounded-card border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(overview?.control?.lastEvents)
                  ? overview.control.lastEvents
                  : []
                ).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono">{e.created_at}</TableCell>
                    <TableCell className="font-mono">{e.action}</TableCell>
                    <TableCell className="font-mono">{e.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
