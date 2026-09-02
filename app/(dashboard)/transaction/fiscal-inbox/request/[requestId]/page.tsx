'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Row = any

function qs(obj: Record<string, any>) {
  const sp = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    sp.set(k, String(v))
  })
  return sp.toString()
}

async function apiGet(path: string) {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function FiscalInboxByRequestIdPage(props: {
  params: Promise<{ requestId: string }>
}) {
  const params = use(props.params)
  const requestId = decodeURIComponent(params.requestId)
  const [stationId, setStationId] = useState('')
  const [data, setData] = useState<{ items: Row[]; count: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const fetchIt = useCallback(async () => {
    setErr(null)
    const query = qs({ requestId, stationId: stationId || undefined })
    const d = await apiGet(`/api/runtime/fiscal/inbox/by-request?${query}`)
    setData(d)
  }, [requestId, stationId])

  useEffect(() => {
    queueMicrotask(() => {
      fetchIt().catch((e) => setErr(e.message))
    })
  }, [fetchIt])

  const items = data?.items ?? []

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <PageHeader
          title="Fiscal Inbox — requestId"
          description="Review fiscal inbox rows for this request id."
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <div className="text-xs text-[var(--text-muted)]">
                  Station (optional)
                </div>
                <Input
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  placeholder="Filter"
                  className="w-44"
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => fetchIt().catch((e) => setErr(e.message))}
              >
                Refresh
              </Button>
            </div>
          }
        />
        <div className="font-mono text-xs text-[var(--text-muted)]">
          {requestId}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="text-sm text-[var(--text-secondary)]">
            Rows: {data?.count ?? 0}
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="No rows"
              description="No inbox entries found for this request id."
            />
          ) : (
            <div className="overflow-auto rounded-card border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Next attempt</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Dead</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/transaction/fiscal-inbox/${r.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {r.id}
                        </Link>
                      </TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>{r.topic}</TableCell>
                      <TableCell>{r.attempt_count ?? 0}</TableCell>
                      <TableCell>{r.next_attempt_at ?? ''}</TableCell>
                      <TableCell>{r.created_at ?? ''}</TableCell>
                      <TableCell>{r.processed_at ?? ''}</TableCell>
                      <TableCell>{r.dead_at ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2">
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            Raw JSON (first row)
          </div>
          <pre className="max-h-[360px] overflow-auto rounded-card border border-border bg-surface-muted p-3 text-xs">
            {items[0] ? JSON.stringify(items[0], null, 2) : '{}'}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
