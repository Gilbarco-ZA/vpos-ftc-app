import { forwardRef, InputHTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cx(
          'h-4 w-4 rounded border border-[var(--border-default)] text-[var(--text-primary)] accent-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
          className,
        )}
        {...props}
      />
    )
  },
)

Checkbox.displayName = 'Checkbox'
