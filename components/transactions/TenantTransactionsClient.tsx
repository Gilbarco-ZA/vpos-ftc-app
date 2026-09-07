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
type FuelOption = {
  nozzleId?: string | null
  nozzleNumber: number
  pumpNumber: number
  gradeName?: string | null
  productCode?: string | null
}
type PendingAllocation = {
  id: string
  pump_number: number
  nozzle_number: number
  buyer_name?: string | null
  tin?: string | null
}

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

const customerRows = (data: any): Cust[] => {
  const payload = data?.data ?? data
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

const customerName = (customer: Cust) =>
  String(
    customer?.buyerName ??
      customer?.buyer_name ??
      customer?.trade_name ??
      customer?.businessName ??
      customer?.business_name ??
      customer?.tin ??
      customer?.id ??
      '',
  )

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
  const [success, setSuccess] = useState<string | null>(null)
  const [captureOrder, setCaptureOrder] = useState<
    'before_transaction' | 'after_transaction' | null
  >(null)
  const [fuelOptions, setFuelOptions] = useState<FuelOption[]>([])
  const [pending, setPending] = useState<PendingAllocation[]>([])
  const [selectedFuel, setSelectedFuel] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [authorizing, setAuthorizing] = useState(false)

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
      const payload = data?.data ?? data
      setTxns(Array.isArray(payload?.items) ? payload.items : payload || [])
    } catch {}
  }

  const refreshPreFuelState = async () => {
    const [stateResponse, fuelResponse] = await Promise.all([
      fetch('/api/transactions/pre-fuel-customer', { cache: 'no-store' }),
      fetch('/api/transactions/fuel-options', { cache: 'no-store' }),
    ])
    const stateBody = await stateResponse.json().catch(() => ({}))
    const fuelBody = await fuelResponse.json().catch(() => ({}))
    const state = stateBody?.data ?? stateBody
    const fuels = fuelBody?.data ?? fuelBody
    setCaptureOrder(
      state?.captureOrder === 'before_transaction'
        ? 'before_transaction'
        : 'after_transaction',
    )
    setPending(Array.isArray(state?.allocations) ? state.allocations : [])
    setFuelOptions(Array.isArray(fuels?.options) ? fuels.options : [])
  }

  useEffect(() => {
    void refreshPreFuelState().catch(() => setCaptureOrder('after_transaction'))
  }, [])

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
          { cache: 'no-store' },
        )
        const data = await res.json().catch(() => [])
        setCustomers(customerRows(data))
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

  const authorizePreFuel = async () => {
    if (!csrfToken || !selectedFuel || !selectedCustomer || authorizing) return
    const fuel = fuelOptions.find(
      (option) => `${option.pumpNumber}:${option.nozzleNumber}` === selectedFuel,
    )
    if (!fuel) return

    setAuthorizing(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/transactions/pre-fuel-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          pumpNumber: fuel.pumpNumber,
          nozzleNumber: fuel.nozzleNumber,
          nozzleId: fuel.nozzleId,
          customerId: selectedCustomer,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error?.message ?? 'Unable to authorize nozzle')
      }
      setSuccess(
        `Customer allocated to Pump ${fuel.pumpNumber} / Nozzle ${fuel.nozzleNumber}. Dispensing is authorized.`,
      )
      setSelectedFuel('')
      setSelectedCustomer('')
      setQ('')
      setCustomers([])
      await refreshPreFuelState()
    } catch (reason: any) {
      setError(reason?.message ?? String(reason))
    } finally {
      setAuthorizing(false)
    }
  }

  const cancelPreFuel = async (allocation: PendingAllocation) => {
    if (!csrfToken) return
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/transactions/pre-fuel-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ action: 'cancel', allocationId: allocation.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error?.message ?? 'Unable to cancel allocation')
      }
      setSuccess('Pre-fuel customer allocation cancelled.')
      await refreshPreFuelState()
    } catch (reason: any) {
      setError(reason?.message ?? String(reason))
    }
  }

  if (captureOrder === 'before_transaction') {
    return (
      <div className="space-y-4">
        <CsrfBootstrap onToken={setCsrfToken} />
        {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}
        {success ? (
          <Alert variant={STATUS_VARIANT.SUCCESS}>{success}</Alert>
        ) : null}

        <Card className="space-y-4 p-4">
          <div>
            <div className="text-base font-semibold text-[var(--text-primary)]">
              Pre-transaction customer capture
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Select the customer and exact nozzle before dispensing. The
              customer will be attached to the next transaction from that
              nozzle before fiscalization.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Nozzle
              </div>
              <Select
                className="mt-1"
                value={selectedFuel}
                onChange={(event) => setSelectedFuel(event.target.value)}
              >
                <option value="">Select pump / nozzle...</option>
                {fuelOptions.map((option) => (
                  <option
                    key={`${option.pumpNumber}:${option.nozzleNumber}`}
                    value={`${option.pumpNumber}:${option.nozzleNumber}`}
                  >
                    Pump {option.pumpNumber} / Nozzle {option.nozzleNumber}
                    {option.gradeName ? ` — ${option.gradeName}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Customer search
              </div>
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search by name or PIN/TIN"
                className="mt-1"
              />
              <Select
                className="mt-2"
                value={selectedCustomer}
                onChange={(event) => setSelectedCustomer(event.target.value)}
              >
                <option value="">
                  {loadingCustomers ? 'Searching...' : 'Select customer...'}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerName(customer)}
                    {customer.tin ? ` — ${customer.tin}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => void authorizePreFuel()}
              disabled={
                !csrfToken || !selectedFuel || !selectedCustomer || authorizing
              }
            >
              {authorizing ? 'Authorizing…' : 'Allocate customer & authorize'}
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
            Pending nozzle allocations
          </div>
          {pending.length === 0 ? (
            <div className="p-4 text-sm text-[var(--text-muted)]">
              No nozzles are currently waiting for a transaction.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pump</TableHead>
                  <TableHead>Nozzle</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>PIN/TIN</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>{allocation.pump_number}</TableCell>
                    <TableCell>{allocation.nozzle_number}</TableCell>
                    <TableCell>{allocation.buyer_name || '—'}</TableCell>
                    <TableCell>{allocation.tin || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void cancelPreFuel(allocation)}
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    )
  }

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
                      <span className="text-xs text-[var(--text-muted)]">-</span>
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
                            {customerName(c)}
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
