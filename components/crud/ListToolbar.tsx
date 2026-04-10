'use client'

import { ReactNode, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

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
  const end = new Date(today)
  const start = new Date(today)

  if (preset === 'today') {
  } else if (preset === 'yesterday') {
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

export type FacetOption = { label: string; value: string }
export type FacetFilter = {
  key: string
  label: string
  options: FacetOption[]
  value?: string
}

export function ListToolbar(props: {
  baseActionPath: string
  searchKey?: string
  searchPlaceholder?: string
  initial?: {
    q?: string
    startDate?: string
    endDate?: string
    preset?: PresetKey
  }
  facets?: FacetFilter[]
  rightSlot?: ReactNode
}) {
  const {
    baseActionPath,
    initial,
    facets = [],
    rightSlot,
    searchKey = 'q',
    searchPlaceholder = 'ID / ref / customer / …',
  } = props

  const [preset, setPreset] = useState<PresetKey>(initial?.preset ?? 'last7')
  const [q, setQ] = useState(initial?.q ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')

  useEffect(() => {
    if (preset === 'custom') return
    const r = presetToRange(preset)
    setStartDate(r.startDate)
    setEndDate(r.endDate)
  }, [preset])

  return (
    <form
      method="get"
      action={baseActionPath}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface-card p-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col">
          <label className="text-xs text-[var(--text-secondary)]">Search</label>
          <Input
            name={searchKey}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-64"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-[var(--text-secondary)]">
            Date preset
          </label>
          <Select
            name="preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetKey)}
            className="w-40"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="thisMonth">This month</option>
            <option value="custom">Custom</option>
          </Select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-[var(--text-secondary)]">From</label>
          <Input
            type="date"
            name="startDate"
            value={startDate}
            onChange={(e) => {
              setPreset('custom')
              setStartDate(e.target.value)
            }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-[var(--text-secondary)]">To</label>
          <Input
            type="date"
            name="endDate"
            value={endDate}
            onChange={(e) => {
              setPreset('custom')
              setEndDate(e.target.value)
            }}
            className="w-40"
          />
        </div>

        {facets.map((f) => (
          <div key={f.key} className="flex flex-col">
            <label className="text-xs text-[var(--text-secondary)]">
              {f.label}
            </label>
            <Select name={f.key} defaultValue={f.value ?? ''} className="w-40">
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {rightSlot}
        <Button type="submit" variant="primary">
          Apply
        </Button>
        <Button asChild variant="secondary">
          <a href={baseActionPath} title="Clear all filters">
            Clear
          </a>
        </Button>
      </div>
    </form>
  )
}
