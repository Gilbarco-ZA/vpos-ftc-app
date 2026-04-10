'use client'

import { useMemo, useState } from 'react'
import {
  CircleDollarSign,
  ReceiptText,
  Users,
  WalletCards,
  XCircle,
} from 'lucide-react'

import { applyDateRangeParams } from '@/src/shared/crud/filters'
import { useApi } from '@/src/shared/hooks/useApi'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'

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

type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function presetToRange(preset: PresetKey) {
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

function buildSummaryUrl(range: { startDate: string; endDate: string }) {
  const params = new URLSearchParams()
  applyDateRangeParams(params, range, { fromKey: 'start', toKey: 'end' })
  return `/api/dashboard/summary?${params.toString()}`
}

export function DashboardSummary({
  initialPreset = 'today',
  title = 'Summary',
}: {
  initialPreset?: PresetKey
  title?: string
}) {
  const [preset, setPreset] = useState<PresetKey>(initialPreset)

  const range = useMemo(() => presetToRange(preset), [preset])
  const url = useMemo(() => buildSummaryUrl(range), [range])

  const {
    data,
    error: err,
    loading,
  } = useApi<Summary>(url, {
    parse: (body) => body?.data ?? body,
  })

  const showInitialLoading = loading && !data

  const tiles = [
    {
      label: 'Transactions',
      value: data?.totals?.transactionCount ?? '—',
      icon: <ReceiptText className="h-5 w-5" />,
    },
    {
      label: 'Fiscalized',
      value: data?.totals?.fiscalizedCount ?? '—',
      icon: <WalletCards className="h-5 w-5" />,
    },
    {
      label: 'Non-fiscalized',
      value: data?.totals?.nonFiscalizedCount ?? '—',
      icon: <ReceiptText className="h-5 w-5" />,
    },
    {
      label: 'Failed',
      value: data?.totals?.failedCount ?? '—',
      icon: <XCircle className="h-5 w-5" />,
    },
    {
      label: 'Total Amount',
      value:
        data?.totals?.totalAmount != null
          ? Number(data.totals.totalAmount).toLocaleString()
          : '—',
      icon: <CircleDollarSign className="h-5 w-5" />,
    },
    {
      label: 'Customers',
      value: data?.totals?.customerCount ?? '—',
      icon: <Users className="h-5 w-5" />,
    },
  ]

  return (
    <Card className="animate-fade-up overflow-hidden">
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span>{range.startDate}</span>
              <svg
                className="h-3 w-3 text-white/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span>{range.endDate}</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
              htmlFor="dashboard-summary-range"
            >
              Range
            </label>
            <Select
              id="dashboard-summary-range"
              className="w-full sm:w-44"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetKey)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="thisMonth">This month</option>
            </Select>
          </div>
        </div>

        {err ? (
          <Alert variant={STATUS_VARIANT.ERROR}>
            {err instanceof Error ? err.message : String(err)}
          </Alert>
        ) : null}

        <div className="relative">
          {loading && data ? (
            <LoadingOverlay label="Refreshing summary…" />
          ) : null}

          {showInitialLoading ? (
            <div className="stagger-enter grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: tiles.length }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-7 w-24" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="stagger-enter grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tiles.map((t) => (
                <StatCard
                  key={t.label}
                  label={t.label}
                  value={t.value}
                  icon={t.icon}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
