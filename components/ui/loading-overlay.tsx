import { Loader2 } from 'lucide-react'

import { cx } from '@/src/shared/utils/cx'

export function LoadingOverlay({
  label = 'Loading…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cx(
        'absolute inset-0 z-10 flex animate-fade-in items-center justify-center rounded-[inherit] bg-[var(--surface-overlay)] backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-2.5 text-sm text-[var(--text-secondary)] shadow-elevated">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span>{label}</span>
      </div>
    </div>
  )
}
