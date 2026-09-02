'use client'

import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useEffect, useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { formatNumber } from '@/src/shared/utils/format'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
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

type Txn = Record<string, any>
type Cust = Record<string, any>

function remainingSeconds(
  expiresAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!expiresAt) return null
  const t = new Date(expiresAt).getTime()
  if (!Number.isFinite(t)) return null
  const diff = Math.ceil((t - nowMs) / 1000)
  return diff > 0 ? diff : 0
}

export default function TenantTransactionsClient(props: {
  initial: Txn[]
  decimals: DecimalSettings
  startDate?: string
  endDate?: string
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [txns, setTxns] = useState<Txn[]>(props.initial || [])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [q, setQ] = useState('')
  const [customers, setCustomers] = useState<Cust[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formatMoney = (value: any) =>
    formatNumber(value == null ? null : Number(value), props.decimals.money)

  const refreshTxns = async () => {
    try {
      const params = new URLSearchParams({ status: 'OPEN' })
      if (props.startDate) params.set('startDate', props.startDate)
      if (props.endDate) params.set('endDate', props.endDate)
      const res = await fetch(`/api/transactions?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      setTxns(data?.data || data || [])
    } catch {}
  }

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const term = q.trim()
    const t = setTimeout(async () => {
      if (!term) {
        setCustomers([])
        return
      }
      setLoadingCustomers(true)
      try {
        const res = await fetch(
          `/api/customers?q=${encodeURIComponent(term)}`,
          {
            cache: 'no-store',
          },
        )
        const data = await res.json().catch(() => [])
        setCustomers(Array.isArray(data?.data) ? data.data : data)
      } catch {
        setCustomers([])
      } finally {
        setLoadingCustomers(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const rows = useMemo((): (Txn & { remaining: number | null })[] => {
    return (txns || []).map((t) => ({
      ...t,
      remaining: remainingSeconds(t.linking_window_expires_at, nowMs),
    }))
  }, [txns, nowMs])

  return (
    <Card className="space-y-4 p-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            Customer search
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by TIN or trade name"
            className="mt-1"
          />
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {loadingCustomers
              ? 'Searching...'
              : customers.length
                ? `Found ${customers.length} customers`
                : q.trim()
                  ? 'No matches'
                  : 'Type to search customers'}
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={() => refreshTxns()}>
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Pump</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Linking window</TableHead>
              <TableHead>Allocate customer</TableHead>
              <TableHead>Send</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8">
                  <EmptyState
                    title="No open transactions"
                    description="Check the pump filter or refresh to try again."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t, x) => (
                <TableRow key={x}>
                  <TableCell className="align-top">
                    <div className="text-xs text-[var(--text-secondary)]">
                      {t.transaction_date_time
                        ? new Date(t.transaction_date_time).toLocaleString()
                        : ''}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {t.id}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    {t.pump_number ?? ''}
                  </TableCell>
                  <TableCell className="align-top">
                    {formatMoney(t.total_amount)}
                  </TableCell>
                  <TableCell className="align-top">
                    {t.remaining == null ? (
                      <span className="text-xs text-[var(--text-muted)]">
                        -
                      </span>
                    ) : t.remaining === 0 ? (
                      <Badge variant={STATUS_VARIANT.WARN}>Expired</Badge>
                    ) : (
                      <Badge variant={STATUS_VARIANT.NEUTRAL}>
                        {t.remaining}s
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    <form
                      action="/api/transactions/allocate"
                      method="post"
                      onSubmit={() => setError(null)}
                      className="space-y-2"
                    >
                      <CsrfHiddenInput token={csrfToken} />
                      <input type="hidden" name="transactionId" value={t.id} />
                      <Select name="customerId" required defaultValue="">
                        <option value="">Select customer...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {(c.trade_name || '').toString() ||
                              (c.tin || '').toString() ||
                              c.id}
                          </option>
                        ))}
                      </Select>
                      <Button className="w-full" variant="primary">
                        Allocate
                      </Button>
                    </form>
                    {t?.last_error ? (
                      <div className="mt-2 text-[11px] text-red-600">
                        {String(t.last_error)}
                      </div>
                    ) : null}
                  </TableCell>

                  <TableCell className="align-top">
                    <form action="/api/transactions/send-now" method="post">
                      <CsrfHiddenInput token={csrfToken} />
                      <input type="hidden" name="transactionId" value={t.id} />
                      <Button className="w-full" variant="secondary">
                        Send now
                      </Button>
                    </form>
                    <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                      Auto-send when window expires.
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="text-xs text-[var(--text-muted)]">
        Tip: If you do not see the customer you need, create it via Customers,
        then refresh and search again.
      </div>
    </Card>
  )
}
