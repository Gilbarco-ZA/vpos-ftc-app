'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { applyDateRangeParams } from '@/src/shared/crud/filters'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Summary = {
  range: { start: string; end: string }
  totals: {
    transactionCount: number
    fiscalizedCount: number
    nonFiscalizedCount: number
    failedCount: number
    totalAmount: number
    customerCount: number
  }
}

type ApiEnvelope<T> = {
  ok?: boolean
  data?: T
}

type TransactionsResponse = {
  items?: TxnRow[]
  transactions?: TxnRow[]
}

type TxnRow = {
  id: string
  timestamp?: string
  transaction_date_time?: string
  pump_number?: number | null
  fuel_type?: string | null
  volume?: number | null
  total_amount?: number | null
  status?: string | null
  verificationCode?: string | null
}

type PresetKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'custom'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function presetToRange(preset: PresetKey): {
  startDate: string
  endDate: string
} {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(today)
  const end = new Date(today)

  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  } else if (preset === 'last7') {
    start.setDate(start.getDate() - 6)
  } else if (preset === 'last30') {
    start.setDate(start.getDate() - 29)
  } else if (preset === 'thisMonth') {
    start.setDate(1)
  }

  return { startDate: toYmd(start), endDate: toYmd(end) }
}

export function ManagerReportsClient({
  initial,
}: {
  initial?: {
    preset?: PresetKey
    startDate?: string
    endDate?: string
    pumpNumber?: string
    status?: string
  }
}) {
  const [preset, setPreset] = useState<PresetKey>(initial?.preset || 'last7')
  const [startDate, setStartDate] = useState(
    initial?.startDate || presetToRange(preset).startDate,
  )
  const [endDate, setEndDate] = useState(
    initial?.endDate || presetToRange(preset).endDate,
  )
  const [pumpNumber, setPumpNumber] = useState(initial?.pumpNumber || '')
  const [status, setStatus] = useState(initial?.status || '')

  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handlePresetChange = (nextPreset: PresetKey) => {
    setPreset(nextPreset)
    if (nextPreset === 'custom') return
    const range = presetToRange(nextPreset)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      applyDateRangeParams(
        params,
        { startDate, endDate },
        { fromKey: 'start', toKey: 'end' },
      )

      const [sRes, tRes] = await Promise.all([
        fetch(`/api/dashboard/summary?${params.toString()}`, {
          cache: 'no-store',
        }),
        fetch(`/api/transactions?${params.toString()}&limit=50`, {
          cache: 'no-store',
        }),
      ])

      if (!sRes.ok) throw new Error(`Failed to load summary (${sRes.status})`)
      if (!tRes.ok)
        throw new Error(`Failed to load transactions (${tRes.status})`)

      const sJson = (await sRes.json()) as ApiEnvelope<Summary>
      const tJson = (await tRes.json()) as ApiEnvelope<TransactionsResponse>

      const resolvedSummary = sJson?.data ?? (sJson as unknown as Summary)
      const transactionPayload =
        tJson?.data ?? (tJson as unknown as TransactionsResponse)
      const transactionRows = Array.isArray(transactionPayload?.items)
        ? transactionPayload.items
        : Array.isArray(transactionPayload?.transactions)
          ? transactionPayload.transactions
          : []

      const txns = transactionRows.slice(0, 50)

      const filtered = txns.filter((r) => {
        if (pumpNumber && String(r.pump_number ?? '') !== String(pumpNumber))
          return false
        if (
          status &&
          String(r.status ?? '').toLowerCase() !== status.toLowerCase()
        )
          return false
        return true
      })

      setSummary(resolvedSummary)
      setRows(filtered)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [endDate, pumpNumber, startDate, status])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const showInitialLoading = loading && !summary && rows.length === 0

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams()
    params.set('startDate', `${startDate}T00:00:00`)
    params.set('endDate', `${endDate}T23:59:59`)
    if (pumpNumber) params.set('pumpNumber', pumpNumber)
    if (status) params.set('status', status)
    return `/api/reports/transactions.csv?${params.toString()}`
  }, [startDate, endDate, pumpNumber, status])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Station-scoped operational reporting"
      />

      <Card className="relative">
        {loading && !showInitialLoading ? (
          <LoadingOverlay label="Refreshing report metrics…" />
        ) : null}
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
            <FormField label="Preset" className="md:col-span-3">
              <Select
                value={preset}
                onChange={(e) =>
                  handlePresetChange(e.target.value as PresetKey)
                }
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
                <option value="thisMonth">This month</option>
                <option value="custom">Custom</option>
              </Select>
            </FormField>

            <FormField label="Start date" className="md:col-span-3">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPreset('custom')
                  setStartDate(e.target.value)
                }}
              />
            </FormField>

            <FormField label="End date" className="md:col-span-3">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPreset('custom')
                  setEndDate(e.target.value)
                }}
              />
            </FormField>

            <FormField label="Pump (optional)" className="md:col-span-2">
              <Input
                value={pumpNumber}
                onChange={(e) => setPumpNumber(e.target.value)}
                placeholder="e.g. 1"
              />
            </FormField>

            <FormField label="Status" className="md:col-span-1">
              <Input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="OK"
              />
            </FormField>

            <div className="flex flex-col gap-2 md:col-span-12 md:flex-row md:items-center md:justify-between">
              <Button type="button" variant="primary" onClick={refresh}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>

              <Button asChild variant="secondary">
                <Link href={exportUrl}>Export Transactions CSV</Link>
              </Button>
            </div>
          </div>

          {err ? <Alert variant={STATUS_VARIANT.ERROR}>{err}</Alert> : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {showInitialLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded border bg-[var(--surface-card)] p-4 shadow-sm"
                  >
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-3 h-7 w-20" />
                  </div>
                ))
              : [
                  ['Transactions', summary?.totals.transactionCount],
                  ['Fiscalized', summary?.totals.fiscalizedCount],
                  ['Non-fiscalized', summary?.totals.nonFiscalizedCount],
                  ['Failed', summary?.totals.failedCount],
                  [
                    'Total Amount',
                    summary?.totals.totalAmount != null
                      ? Number(summary.totals.totalAmount).toLocaleString()
                      : undefined,
                  ],
                  ['Customers', summary?.totals.customerCount],
                ].map(([label, value]) => (
                  <StatCard
                    key={String(label)}
                    label={label as string}
                    value={loading ? '…' : ((value ?? '—') as any)}
                  />
                ))}
          </div>
        </CardContent>
      </Card>

      <Card className="relative">
        {loading && !showInitialLoading ? (
          <LoadingOverlay label="Refreshing transactions preview…" />
        ) : null}
        <CardContent className="space-y-3">
          <div className="text-sm text-[var(--text-secondary)]">
            Preview (latest 50 in range)
          </div>

          {showInitialLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((__, cellIndex) => (
                    <Skeleton key={cellIndex} className="h-4 w-full" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Pump</TableHead>
                  <TableHead>Fuel</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-6 text-center text-[var(--text-muted)]"
                      colSpan={6}
                    >
                      {loading
                        ? 'Loading…'
                        : 'No transactions match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.timestamp || r.transaction_date_time || '—'}
                      </TableCell>
                      <TableCell>{r.pump_number ?? '—'}</TableCell>
                      <TableCell>{r.fuel_type ?? '—'}</TableCell>
                      <TableCell>{r.volume ?? '—'}</TableCell>
                      <TableCell>{r.total_amount ?? '—'}</TableCell>
                      <TableCell>{r.status ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
