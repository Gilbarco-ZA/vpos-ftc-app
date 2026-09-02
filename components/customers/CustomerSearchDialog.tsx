'use client'

import { useEffect, useState } from 'react'

import { api } from '@/src/shared/api/fetch'

import { Button } from '@/components/ui/button'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<CustomerRow[]>([])
  const [selected, setSelected] = useState<CustomerRow | null>(null)

  useEffect(() => {
    if (open) queueMicrotask(() => setTransactionId(initialTransactionId ?? ''))
  }, [open, initialTransactionId])

  useEffect(() => {
    if (!open) return

    const q = query.trim()
    const timer = setTimeout(async () => {
      setError(null)
      setSelected(null)
      if (!q) {
        setResults([])
        return
      }

      try {
        setLoading(true)
        const res = await api<any>(
          `/api/customers/search?query=${encodeURIComponent(q)}`,
        )
        if (!res.ok) throw new Error(res.message)

        setResults(Array.isArray(res.data?.local) ? res.data.local : [])
      } catch (e: any) {
        setError(e?.message || 'Search failed')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [open, query])

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
              placeholder="Search station customers by TIN or buyer name..."
            />
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
                      Searching...
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
                  results.map((customer) => {
                    const isSelected = selected?.id === customer.id
                    return (
                      <TableRow
                        key={`${customer.id}:${customer.tin ?? ''}`}
                        className={isSelected ? 'bg-muted' : 'cursor-pointer'}
                        onClick={() => setSelected(customer)}
                      >
                        <TableCell className="font-medium">
                          {displayName(customer) || '-'}
                        </TableCell>
                        <TableCell>
                          {(customer.tin ?? '').toString() || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {customer.id}
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
