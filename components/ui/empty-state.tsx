import { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

import { cx } from '@/src/shared/utils/cx'

export type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export const EmptyState = ({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) => {
  return (
    <div
      className={cx(
        'flex animate-fade-in flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] p-10 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-hover)] text-[var(--text-muted)]">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div className="text-sm font-medium text-[var(--text-primary)]">
        {title}
      </div>
      {description && (
        <div className="mt-1.5 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
