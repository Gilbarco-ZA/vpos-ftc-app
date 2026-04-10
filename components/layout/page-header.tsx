import { ReactNode } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
  className?: string
}

export const PageHeader = ({
  title,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) => {
  return (
    <div
      className={cx(
        'flex animate-fade-up flex-col gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-5 shadow-card sm:p-6 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-400/80">
            {eyebrow}
          </div>
        )}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)] sm:text-xl">
            {title}
          </h2>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
