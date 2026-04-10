import { ReactNode } from 'react'

import { cx } from '@/src/shared/utils/cx'

export type DetailListProps = {
  columns?: 1 | 2 | 3
  children: ReactNode
  className?: string
}

const columnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const

export function DetailList({
  columns = 2,
  children,
  className,
}: DetailListProps) {
  return (
    <dl
      className={cx('grid gap-x-6 gap-y-4', columnClasses[columns], className)}
    >
      {children}
    </dl>
  )
}

export type DetailItemProps = {
  label: string
  children: ReactNode
  muted?: boolean
  className?: string
}

export function DetailItem({
  label,
  children,
  muted,
  className,
}: DetailItemProps) {
  return (
    <div className={cx('space-y-1', className)}>
      <dt className="text-xs font-medium text-[var(--text-muted)]">{label}</dt>
      <dd
        className={cx(
          'text-sm',
          muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]',
        )}
      >
        {children}
      </dd>
    </div>
  )
}
