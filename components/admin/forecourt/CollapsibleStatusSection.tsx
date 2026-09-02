import type { StatusVariant } from '@/src/shared/status/ui'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'

export type CollapsibleStatusSectionProps = {
  title: string
  status: ReactNode
  children: ReactNode
  statusVariant?: StatusVariant
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
}

export function CollapsibleStatusSection({
  title,
  status,
  children,
  statusVariant = STATUS_VARIANT.INFO,
  defaultOpen = false,
  className = '',
  contentClassName = 'p-3 pt-0',
}: CollapsibleStatusSectionProps) {
  return (
    <details
      open={defaultOpen || undefined}
      className={`group rounded border bg-[var(--surface-card)] ${className}`.trim()}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:content-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </span>
        <span className="flex items-center gap-2">
          <Badge variant={statusVariant}>{status}</Badge>
          <ChevronDown
            className="h-4 w-4 text-[var(--text-muted)] transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className={contentClassName}>{children}</div>
    </details>
  )
}
