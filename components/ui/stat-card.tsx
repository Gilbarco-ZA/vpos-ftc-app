import { ReactNode } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type StatCardProps = {
  label: string
  value: ReactNode
  trend?: ReactNode
  icon?: ReactNode
  className?: string
}

export function StatCard({
  label,
  value,
  trend,
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cx(
        'card-hover group relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-5 shadow-card transition-all duration-300 ease-out hover:border-[var(--border-strong)] hover:shadow-elevated',
        className,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.03] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
            {value}
          </p>
        </div>
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-hover)] text-[var(--text-muted)] transition-all duration-300 group-hover:border-blue-500/30 group-hover:bg-blue-500/10 group-hover:text-blue-400">
            {icon}
          </span>
        )}
      </div>
      {trend && (
        <div className="relative mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          {trend}
        </div>
      )}
    </div>
  )
}
