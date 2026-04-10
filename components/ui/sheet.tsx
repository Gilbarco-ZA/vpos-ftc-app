'use client'

import { forwardRef, HTMLAttributes } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cx } from '@/src/shared/utils/cx'

type SheetSide = 'left' | 'right'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export const SheetPortal = DialogPrimitive.Portal

export const SheetOverlay = forwardRef<
  HTMLDivElement,
  DialogPrimitive.DialogOverlayProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cx(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

export type SheetContentProps = DialogPrimitive.DialogContentProps & {
  side?: SheetSide
}

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = 'right', children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cx(
          'fixed inset-y-0 z-50 flex w-full max-w-[92vw] flex-col border-[var(--border-default)] bg-[var(--surface-card)] p-5 shadow-elevated focus:outline-none sm:max-w-lg sm:p-6',
          'data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'right'
            ? 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
            : 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
)
SheetContent.displayName = 'SheetContent'

export const SheetHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('space-y-1.5 pr-8', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

export const SheetFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cx(
      'mt-auto flex flex-col gap-3 border-t border-[var(--border-default)] pt-5 sm:flex-row sm:items-center sm:justify-end',
      className,
    )}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

export const SheetTitle = forwardRef<
  HTMLHeadingElement,
  DialogPrimitive.DialogTitleProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cx(
      'text-[15px] font-semibold text-[var(--text-primary)]',
      className,
    )}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

export const SheetDescription = forwardRef<
  HTMLParagraphElement,
  DialogPrimitive.DialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cx(
      'mt-1 text-sm leading-relaxed text-[var(--text-muted)]',
      className,
    )}
    {...props}
  />
))
SheetDescription.displayName = 'SheetDescription'
