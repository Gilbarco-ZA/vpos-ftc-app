import { forwardRef, HTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export const Skeleton = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cx(
      'relative overflow-hidden rounded-lg bg-[var(--surface-hover)]',
      className,
    )}
    {...props}
  >
    <div className="shimmer absolute inset-0" />
  </div>
))

Skeleton.displayName = 'Skeleton'
