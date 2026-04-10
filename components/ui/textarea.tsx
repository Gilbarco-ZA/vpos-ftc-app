import { forwardRef, TextareaHTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx(
        'min-h-[96px] w-full rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-[var(--text-primary)] shadow-card outline-none placeholder:text-[var(--text-muted)] focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-black/20',
        className,
      )}
      {...props}
    />
  ),
)

Textarea.displayName = 'Textarea'
