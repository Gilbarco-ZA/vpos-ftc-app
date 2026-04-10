import { ReactNode } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type FormFieldProps = {
  label: string
  required?: boolean
  error?: string
  helpText?: string
  children: ReactNode
  className?: string
}

export function FormField({
  label,
  required,
  error,
  helpText,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cx('space-y-2', className)}>
      <label className="block text-sm font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--status-error-text)]">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {error}
        </p>
      )}
      {!error && helpText && (
        <p className="text-xs text-[var(--text-muted)]">{helpText}</p>
      )}
    </div>
  )
}
