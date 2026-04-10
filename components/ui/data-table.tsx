'use client'

import { ReactNode } from 'react'

import { cx } from '@/src/shared/utils/cx'

import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type DataTableColumn<T> = {
  key: string
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  data: T[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  toolbar?: ReactNode
  onRefresh?: () => void
  keyExtractor?: (row: T, index: number) => string | number
  className?: string
}

function LoadingSkeleton({
  columns,
  rows = 5,
}: {
  columns: number
  rows?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: columns }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyTitle = 'No data',
  emptyDescription,
  toolbar,
  onRefresh,
  keyExtractor,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cx('space-y-3', className)}>
      {toolbar}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <LoadingSkeleton columns={columns.length} />
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  action={
                    onRefresh ? (
                      <button
                        type="button"
                        onClick={onRefresh}
                        className="text-xs font-medium text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
                      >
                        Refresh
                      </button>
                    ) : undefined
                  }
                  className="rounded-none border-0"
                />
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, idx) => (
              <TableRow key={keyExtractor ? keyExtractor(row, idx) : idx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
