import type { StatusVariant } from '@/src/shared/status/ui'
import { forwardRef, HTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type BadgeVariant = StatusVariant

const variantStyles: Record<BadgeVariant, string> = {
  success:
    'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
  warn: 'border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-text)]',
  error:
    'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
  info: 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]',
  neutral:
    'border-[var(--border-default)] bg-[var(--surface-hover)] text-[var(--text-secondary)]',
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
  dot?: boolean
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-200',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  ),
)

Badge.displayName = 'Badge'
