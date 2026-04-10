import type { ToastVariant } from '@/src/shared/status/ui'
import { forwardRef, HTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type { ToastVariant } from '@/src/shared/status/ui'

export type ToastItemProps = HTMLAttributes<HTMLDivElement> & {
  variant?: ToastVariant
  onDismiss?: () => void
}

export type ToastMessage = {
  id: string
  variant: ToastVariant
  message: string
}

const variantStyles: Record<ToastVariant, string> = {
  success:
    'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
  error:
    'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
  info: 'border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]',
}

export const ToastViewport = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cx(
      'fixed inset-x-4 top-4 z-50 space-y-2 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm',
      className,
    )}
    {...props}
  />
)

export const ToastItem = forwardRef<HTMLDivElement, ToastItemProps>(
  ({ className, variant = 'info', onDismiss, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cx(
        'flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm shadow-card backdrop-blur animate-in slide-in-from-top-2',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 shrink-0 text-current opacity-60 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  ),
)

ToastItem.displayName = 'ToastItem'
