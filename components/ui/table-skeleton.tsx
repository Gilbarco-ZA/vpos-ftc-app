import { cx } from '@/src/shared/utils/cx'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export type TableSkeletonProps = {
  /** Number of skeleton rows to render. Default: 6 */
  rows?: number
  /** Number of columns per row. Default: 4 */
  columns?: number
  /** Show a page-header skeleton (title + description + action button). Default: true */
  showHeader?: boolean
  /** Show a filter-bar skeleton. Default: true */
  showFilters?: boolean
  className?: string
}

/**
 * Standardized table-page loading skeleton.
 * Renders optional page header, filter bar, and tabular rows.
 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
  showHeader = true,
  showFilters = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cx('space-y-4', className)}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
      )}

      {showFilters && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-24" />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="space-y-3 p-4">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div key={rowIdx} className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="flex items-center gap-4">
                {Array.from({ length: Math.max(1, columns - 2) }).map(
                  (_, colIdx) => (
                    <Skeleton
                      key={colIdx}
                      className={cx('h-4', colIdx === 0 ? 'w-16' : 'w-20')}
                    />
                  ),
                )}
                <Skeleton className="h-8 w-10" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
