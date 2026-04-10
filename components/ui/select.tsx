import { forwardRef, SelectHTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cx(
        'h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition-all duration-200 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] focus-visible:border-blue-500/50 focus-visible:bg-[var(--surface-elevated)] focus-visible:ring-2 focus-visible:ring-blue-500/20',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)

Select.displayName = 'Select'
