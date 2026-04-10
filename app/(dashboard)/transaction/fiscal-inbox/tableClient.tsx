'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Row = {
  id: number
  topic: 'fiscal' | 'pos'
  request_id: string | null
  status: string
  attempt_count: number
  next_attempt_at: any
  received_at: any
  error_text?: string | null
}

export function FiscalInboxTableClient({
  stationId,
  rows,
}: {
  stationId: string
  rows: Row[]
}) {
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const selectedIds = useMemo(
    () =>
      Object.keys(selected)
        .filter((k) => selected[Number(k)])
        .map((k) => Number(k)),
    [selected],
  )

  const allChecked = rows.length > 0 && rows.every((r) => selected[r.id])

  const toggleAll = () => {
    if (allChecked) {
      setSelected({})
    } else {
      const next: Record<number, boolean> = {}
      for (const r of rows) next[r.id] = true
      setSelected(next)
    }
  }

  const toggleOne = (id: number) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const runBulk = async (action: string) => {
    if (selectedIds.length === 0) {
      alert('No rows selected')
      return
    }
    if (action === 'DELETE') {
      if (
        !confirm(`Delete ${selectedIds.length} row(s)? This cannot be undone.`)
      )
        return
    }
    const errorText =
      action === 'MARK_FAILED' || action === 'MARK_DEAD'
        ? (prompt('Optional error text (leave blank for default):') ?? '')
        : ''

    const res = await fetch('/api/runtime/fiscal/inbox/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stationId,
        action,
        ids: selectedIds,
        errorText: errorText || undefined,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed')
      alert(text)
      return
    }
    window.location.reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded border bg-[var(--surface-card)] p-3">
        <div className="text-sm text-[var(--text-secondary)]">
          Selected: <span className="font-medium">{selectedIds.length}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => runBulk('REQUEUE')}
        >
          Requeue
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => runBulk('MARK_FAILED')}
        >
          Mark FAILED
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => runBulk('MARK_DEAD')}
        >
          Mark DEAD
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => runBulk('MARK_PROCESSED')}
        >
          Mark PROCESSED
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => runBulk('DELETE')}
        >
          Delete
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox checked={allChecked} onChange={toggleAll} />
            </TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead>Request ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Next</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                className="py-3 text-[var(--text-secondary)]"
                colSpan={8}
              >
                No rows.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox
                    checked={!!selected[r.id]}
                    onChange={() => toggleOne(r.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    className="text-blue-700 hover:underline"
                    href={`/transaction/fiscal-inbox/${r.id}`}
                  >
                    {r.id}
                  </Link>
                </TableCell>
                <TableCell>{r.topic}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.request_id ?? ''}
                </TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>{r.attempt_count}</TableCell>
                <TableCell>
                  {r.received_at
                    ? new Date(r.received_at).toLocaleString()
                    : ''}
                </TableCell>
                <TableCell>
                  {r.next_attempt_at
                    ? new Date(r.next_attempt_at).toLocaleString()
                    : ''}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
