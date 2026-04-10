import type { AlertVariant } from '@/src/shared/status/ui'
import { ReactNode, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react'

import { cx } from '@/src/shared/utils/cx'

const variantStyles: Record<AlertVariant, string> = {
  success:
    'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
  warn: 'border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-text)]',
  error:
    'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
  info: 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]',
}

const variantIcons: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" />,
  warn: <AlertCircle className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
}

export type AlertProps = {
  variant: AlertVariant
  title?: string
  children?: ReactNode
  icon?: ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
}

export function Alert({
  variant,
  title,
  children,
  icon,
  dismissible,
  onDismiss,
  className,
}: AlertProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const defaultIcon = variantIcons[variant]

  return (
    <div
      role="alert"
      className={cx(
        'flex animate-fade-in gap-3 rounded-lg border p-4 text-sm',
        variantStyles[variant],
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon ?? defaultIcon}</span>
      <div className="flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={() => {
            setDismissed(true)
            onDismiss?.()
          }}
          className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
