'use client'

import { forwardRef } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'

import { cx } from '@/src/shared/utils/cx'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuContentProps
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cx(
        'z-50 min-w-[190px] rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-1.5 text-[var(--text-primary)] shadow-elevated backdrop-blur-xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

export type DropdownMenuItemProps =
  DropdownMenuPrimitive.DropdownMenuItemProps & {
    asChild?: boolean
  }

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  DropdownMenuItemProps
>(({ className, asChild, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    asChild={asChild}
    className={cx(
      'flex cursor-pointer select-none items-center rounded-xl px-3 py-2 text-sm text-[var(--text-secondary)] outline-none transition-colors focus:bg-[var(--surface-hover)] focus:text-[var(--text-primary)]',
      className,
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuCheckboxItemProps
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cx(
      'relative flex cursor-pointer select-none items-center rounded-xl py-2 pl-9 pr-3 text-sm text-[var(--text-secondary)] outline-none transition-colors focus:bg-[var(--surface-hover)] focus:text-[var(--text-primary)]',
      className,
    )}
    {...props}
  >
    <DropdownMenuPrimitive.ItemIndicator className="absolute left-3 inline-flex h-4 w-4 items-center justify-center text-xs">
      ✓
    </DropdownMenuPrimitive.ItemIndicator>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem'

export const DropdownMenuRadioItem = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuRadioItemProps
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cx(
      'relative flex cursor-pointer select-none items-center rounded-xl py-2 pl-9 pr-3 text-sm text-[var(--text-secondary)] outline-none transition-colors focus:bg-[var(--surface-hover)] focus:text-[var(--text-primary)]',
      className,
    )}
    {...props}
  >
    <DropdownMenuPrimitive.ItemIndicator className="absolute left-3 inline-flex h-4 w-4 items-center justify-center text-xs">
      ●
    </DropdownMenuPrimitive.ItemIndicator>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem'

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuLabelProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cx(
      'px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]',
      className,
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = 'DropdownMenuLabel'

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSeparatorProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cx('my-1 h-px bg-[var(--border-default)]', className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

export const DropdownMenuSubTrigger = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSubTriggerProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cx(
      'flex cursor-pointer select-none items-center rounded-xl px-3 py-2 text-sm text-[var(--text-secondary)] outline-none transition-colors focus:bg-[var(--surface-hover)] focus:text-[var(--text-primary)]',
      className,
    )}
    {...props}
  />
))
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger'

export const DropdownMenuSubContent = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSubContentProps
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    sideOffset={sideOffset}
    className={cx(
      'z-50 min-w-[190px] rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-1.5 text-[var(--text-primary)] shadow-elevated backdrop-blur-xl',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      className,
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent'
