import {
  forwardRef,
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'

import { cx } from '@/src/shared/utils/cx'

export const Table = forwardRef<
  HTMLTableElement,
  TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-card">
    <div className="w-full overflow-x-auto">
      <table
        ref={ref}
        className={cx('w-full min-w-[720px] text-sm', className)}
        {...props}
      />
    </div>
  </div>
))
Table.displayName = 'Table'

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cx(
      'border-b border-[var(--border-default)] bg-[var(--surface-hover)] text-[var(--text-muted)]',
      className,
    )}
    {...props}
  />
))
TableHeader.displayName = 'TableHeader'

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cx('[&>tr:last-child]:border-0', className)}
    {...props}
  />
))
TableBody.displayName = 'TableBody'

export const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cx(
      'border-b border-[var(--border-default)] transition-colors duration-200 hover:bg-[var(--surface-hover)]',
      className,
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

export const TableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cx(
      'whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]',
      className,
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

export const TableCell = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cx(
      'px-4 py-3.5 align-middle text-[var(--text-secondary)]',
      className,
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

export const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cx('mt-3 text-xs text-[var(--text-muted)]', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'
