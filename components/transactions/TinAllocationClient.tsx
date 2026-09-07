'use client'

import type { PumpStateSnapshot } from '@/src/shared/pumps/types'
import { useEffect, useMemo, useState } from 'react'

import { formatState, statusVariant } from '@/components/pumps/pumpStatusHelpers'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

type FuelOption = {
  pumpNumber: number
  nozzleId: string | null
  nozzleNumber: number | null
  displayNumber: number | null
  gradeName: string | null
  productCode: string | null
}

type Customer = Record<string, any>
type PendingAllocation = {
  id: string
  pump_number: number
  nozzle_number: number
  display_number?: number | null
  buyer_name?: string | null
  tin?: string | null
}

const customerRows = (data: any): Customer[] => {
  const payload = data?.data ?? data
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

const customerName = (customer: Customer) =>
  String(customer?.buyerName ?? customer?.buyer_name ?? customer?.businessName ?? customer?.business_name ?? customer?.tin ?? '')

export default function TinAllocationClient() {
  const [csrfToken, setCsrfToken] = useState('')
  const [fuelOptions, setFuelOptions] = useState<FuelOption[]>([])
  const [snapshot, setSnapshot] = useState<PumpStateSnapshot | null>(null)
  const [pending, setPending] = useState<PendingAllocation[]>([])
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = async () => {
    const [fuelResponse, stateResponse, allocationResponse] = await Promise.all([
      fetch('/api/transactions/fuel-options', { cache: 'no-store' }),
      fetch('/api/pumps/state', { cache: 'no-store' }),
      fetch('/api/transactions/pre-fuel-customer', { cache: 'no-store' }),
    ])
    const fuelBody = await fuelResponse.json().catch(() => ({}))
    const stateBody = await stateResponse.json().catch(() => ({}))
    const allocationBody = await allocationResponse.json().catch(() => ({}))
    const fuels = fuelBody?.data ?? fuelBody
    const state = stateBody?.data ?? stateBody
    const allocations = allocationBody?.data ?? allocationBody
    setFuelOptions(Array.isArray(fuels?.options) ? fuels.options : [])
    setSnapshot(state?.liveState ?? state ?? null)
    setPending(Array.isArray(allocations?.allocations) ? allocations.allocations : [])
  }

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const term = query.trim()
    const id = window.setTimeout(async () => {
      if (!term) {
        setCustomers([])
        return
      }
      try {
        const response = await fetch(`/api/customers?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        setCustomers(customerRows(await response.json().catch(() => [])))
      } catch {
        setCustomers([])
      }
    }, 250)
    return () => window.clearTimeout(id)
  }, [query])

  const pumps = useMemo(() => {
    const grouped = new Map<number, FuelOption[]>()
    for (const option of fuelOptions) {
      const rows = grouped.get(option.pumpNumber) ?? []
      rows.push(option)
      grouped.set(option.pumpNumber, rows)
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b)
  }, [fuelOptions])

  const stateFor = (pumpNumber: number, nozzleNumber: number | null) => {
    const pump = snapshot?.pumps?.find((item) => Number(item.pumpId) === pumpNumber)
    const nozzle = pump?.nozzles?.find((item) => Number(item.nozzleId) === Number(nozzleNumber))
    return nozzle?.state ?? 'unknown'
  }

  const pendingFor = (pumpNumber: number, nozzleNumber: number | null) =>
    pending.find((item) => item.pump_number === pumpNumber && item.nozzle_number === nozzleNumber)

  const allocate = async (option: FuelOption) => {
    if (!csrfToken || !selectedCustomer || option.nozzleNumber == null) return
    const key = `${option.pumpNumber}:${option.nozzleNumber}`
    setBusyKey(key)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/transactions/pre-fuel-customer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          pumpNumber: option.pumpNumber,
          nozzleNumber: option.nozzleNumber,
          nozzleId: option.nozzleId,
          customerId: selectedCustomer,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) throw new Error(body?.error?.message ?? 'Unable to allocate customer')
      setSuccess(`Customer allocated to Pump ${option.pumpNumber}, Nozzle ${option.displayNumber ?? option.nozzleNumber}.`)
      setSelectedCustomer('')
      setQuery('')
      setCustomers([])
      await refresh()
    } catch (reason: any) {
      setError(reason?.message ?? String(reason))
    } finally {
      setBusyKey('')
    }
  }

  const cancel = async (allocation: PendingAllocation) => {
    if (!csrfToken) return
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/transactions/pre-fuel-customer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ action: 'cancel', allocationId: allocation.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) throw new Error(body?.error?.message ?? 'Unable to cancel allocation')
      await refresh()
    } catch (reason: any) {
      setError(reason?.message ?? String(reason))
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}
      {success ? <Alert variant={STATUS_VARIANT.SUCCESS}>{success}</Alert> : null}

      <Card>
        <CardHeader><CardTitle>Customer TIN/PIN</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer by name or TIN/PIN" />
          <Select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
            <option value="">Select customer...</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customerName(customer)}{customer.tin ? ` — ${customer.tin}` : customer.pin ? ` — ${customer.pin}` : ''}
              </option>
            ))}
          </Select>
          <p className="text-xs text-[var(--text-muted)]">Select a customer first, then choose the physical nozzle below.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {pumps.map(([pumpNumber, nozzles]) => (
          <Card key={pumpNumber}>
            <CardHeader><CardTitle>Pump {pumpNumber}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {nozzles.map((option) => {
                const state = stateFor(pumpNumber, option.nozzleNumber)
                const allocation = pendingFor(pumpNumber, option.nozzleNumber)
                const key = `${pumpNumber}:${option.nozzleNumber}`
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => allocation ? undefined : void allocate(option)}
                    disabled={!selectedCustomer || Boolean(allocation) || busyKey === key}
                    className="rounded-card border border-border bg-surface-card p-4 text-left transition hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">Nozzle {option.displayNumber ?? option.nozzleNumber}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">{option.gradeName || option.productCode || 'Fuel'}</div>
                      </div>
                      <Badge variant={statusVariant(state)}>{formatState(state)}</Badge>
                    </div>
                    {allocation ? (
                      <div className="mt-3 rounded border border-[var(--border-default)] p-2 text-xs">
                        <div className="font-medium">Allocated: {allocation.buyer_name || allocation.tin || 'Customer'}</div>
                        <div className="mt-1 text-[var(--text-muted)]">TIN/PIN: {allocation.tin || '—'}</div>
                        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={(event) => { event.stopPropagation(); void cancel(allocation) }}>Cancel allocation</Button>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-[var(--text-secondary)]">{selectedCustomer ? 'Select this nozzle to allocate and authorize.' : 'Select a customer to enable allocation.'}</div>
                    )}
                  </button>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {pumps.length === 0 ? <Card className="p-6 text-sm text-[var(--text-muted)]">No configured pump/nozzle options are available.</Card> : null}
    </div>
  )
}
