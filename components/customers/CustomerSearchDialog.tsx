'use client'

import { useEffect, useState } from 'react'

import { api } from '@/src/shared/api/fetch'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type CustomerRow = {
  id: string
  tin?: string | null
  buyer_name?: string | null
  buyerName?: string | null
}

function displayName(c: CustomerRow) {
  return (c.buyer_name ?? c.buyerName ?? '').toString()
}

export function CustomerSearchDialog({
  open,
  onOpenChange,
  initialTransactionId,
  onConfirm,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialTransactionId?: string | null
  onConfirm: (args: { transactionId: string; customer: CustomerRow }) => void
  busy?: boolean
}) {
  const [transactionId, setTransactionId] = useState(initialTransactionId ?? '')
  const [query, setQuery] = useState('')
  const [includeCloud, setIncludeCloud] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<CustomerRow[]>([])
  const [cloud, setCloud] = useState<CustomerRow[]>([])
  const [selected, setSelected] = useState<CustomerRow | null>(null)

  // keep txId in sync when dialog opens with a different row
  useEffect(() => {
    if (open) setTransactionId(initialTransactionId ?? '')
  }, [open, initialTransactionId])

  useEffect(() => {
    if (!open) return
    setError(null)
    setSelected(null)

    const q = query.trim()
    if (!q) {
      setLocal([])
      setCloud([])
      return
    }

    const t = setTimeout(async () => {
      try {
        setLoading(true)
        const res = await api<any>(
          `/api/customers/search?query=${encodeURIComponent(q)}&includeCloud=${includeCloud ? 'true' : 'false'}`,
        )
        if (!res.ok) throw new Error(res.message)

        setLocal(Array.isArray(res.data?.local) ? res.data.local : [])
        setCloud(Array.isArray(res.data?.cloud) ? res.data.cloud : [])
      } catch (e: any) {
        setError(e?.message || 'Search failed')
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(t)
  }, [open, query, includeCloud])

  const results = [...local, ...cloud]
  const canConfirm =
    transactionId.trim().length > 0 && selected != null && !busy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Link customer to transaction</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <div className="text-sm font-medium">Transaction ID</div>
            <Input
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. 7f3d..."
            />
          </div>

          <div className="grid gap-1">
            <div className="text-sm font-medium">Customer search</div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by TIN or buyer name…"
            />
            <label className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeCloud}
                onChange={(e) => setIncludeCloud(e.target.checked)}
              />
              Include cloud search if local has no matches
            </label>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buyer name</TableHead>
                  <TableHead>TIN</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground text-sm"
                    >
                      Searching…
                    </TableCell>
                  </TableRow>
                ) : results.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground text-sm"
                    >
                      {query.trim() ? 'No matches.' : 'Type to search.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  results.map((c) => {
                    const isSelected = selected?.id === c.id
                    return (
                      <TableRow
                        key={`${c.id}:${c.tin ?? ''}`}
                        className={isSelected ? 'bg-muted' : 'cursor-pointer'}
                        onClick={() => setSelected(c)}
                      >
                        <TableCell className="font-medium">
                          {displayName(c) || '—'}
                        </TableCell>
                        <TableCell>{(c.tin ?? '').toString() || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.id}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canConfirm}
            onClick={() => {
              if (!selected) return
              onConfirm({
                transactionId: transactionId.trim(),
                customer: selected,
              })
            }}
          >
            Link selected customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
