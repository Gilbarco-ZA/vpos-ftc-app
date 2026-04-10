'use client'

import { ReactNode } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type FiltersRowProps = {
  children: ReactNode
  className?: string
}

export function FiltersRow({ children, className }: FiltersRowProps) {
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-card border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-4 shadow-card backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      {children}
    </div>
  )
}

export type FiltersRowSearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function Search({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: FiltersRowSearchProps) {
  return (
    <div className={cx('w-full min-w-0 flex-1 sm:min-w-[220px]', className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-input border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-sm text-[var(--text-primary)] shadow-sm transition-all placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
      />
    </div>
  )
}

export type FiltersRowSlotProps = {
  children: ReactNode
  width?: string
  className?: string
}

function Slot({
  children,
  width = 'w-full sm:w-44',
  className,
}: FiltersRowSlotProps) {
  return <div className={cx(width, className)}>{children}</div>
}

export type FiltersRowDateRangeProps = {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  className?: string
}

function DateRange({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: FiltersRowDateRangeProps) {
  return (
    <div
      className={cx(
        'grid w-full gap-2 sm:w-auto sm:grid-flow-col sm:items-center',
        className,
      )}
    >
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className="h-11 rounded-input border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-sm text-[var(--text-primary)] shadow-sm hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
      />
      <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
        to
      </span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className="h-11 rounded-input border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-sm text-[var(--text-primary)] shadow-sm hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
      />
    </div>
  )
}

export type FiltersRowActionProps = {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  children?: ReactNode
  className?: string
}

function Action({
  onClick,
  loading,
  disabled,
  children = 'Refresh',
  className,
}: FiltersRowActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        'inline-flex h-11 w-full items-center justify-center rounded-input border border-[var(--border-default)] bg-[var(--surface-card)] px-4 text-sm font-medium text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto',
        className,
      )}
    >
      {loading ? 'Refreshing…' : children}
    </button>
  )
}

FiltersRow.Search = Search
FiltersRow.Slot = Slot
FiltersRow.DateRange = DateRange
FiltersRow.Action = Action
