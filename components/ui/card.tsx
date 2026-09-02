import { forwardRef, HTMLAttributes } from 'react'

import { cx } from '@/src/shared/utils/cx'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cx(
        'rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-card backdrop-blur-xl transition-all duration-200 ease-out hover:border-[var(--neon-cyan)] hover:shadow-[0_0_20px_rgba(0,245,255,0.1)]',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cx('p-5 pb-0 sm:p-6 sm:pb-0', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cx(
      'bg-gradient-to-r from-[var(--neon-cyan)] via-[var(--text-primary)] to-[var(--text-primary)] bg-clip-text text-[15px] font-semibold text-transparent transition-all duration-300',
      className,
    )}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cx(
      'mt-1 text-sm leading-relaxed text-[var(--text-muted)]',
      className,
    )}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx('p-5 sm:p-6', className)} {...props} />
))
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cx(
      'flex flex-col gap-3 border-t border-[var(--border-default)] p-5 sm:flex-row sm:items-center sm:justify-end sm:p-6',
      className,
    )}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'
