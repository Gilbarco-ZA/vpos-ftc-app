import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cx } from '@/src/shared/utils/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'neon-cyan' | 'neon-magenta' | 'neon-green' | 'neon-amber'
type ButtonSize = 'sm' | 'md' | 'lg'

const baseStyles =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]'

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand-primary,var(--text-primary))] text-[var(--brand-primary-foreground,var(--surface-page))] shadow-card hover:opacity-90 hover:shadow-elevated focus-visible:ring-[var(--border-focus,var(--brand-primary,var(--text-primary)))]',
  secondary:
    'border border-[var(--border-default)] bg-[var(--surface-hover)] text-[var(--text-primary)] shadow-card backdrop-blur-sm hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] hover:shadow-elevated',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  destructive:
    'border border-red-500/20 bg-red-500/10 text-red-500 shadow-card hover:border-red-500/30 hover:bg-red-500/20 hover:shadow-elevated',
  'neon-cyan':
    'border-2 border-[var(--neon-cyan)] text-[var(--neon-cyan)] bg-[var(--surface-card)] hover:shadow-[0_0_20px_rgba(0,245,255,0.3)] hover:border-[var(--neon-cyan)] active:scale-[0.95] active:shadow-[0_0_30px_rgba(0,245,255,0.5)]',
  'neon-magenta':
    'border-2 border-[var(--neon-magenta)] text-[var(--neon-magenta)] bg-[var(--surface-card)] hover:shadow-[0_0_20px_rgba(195,0,255,0.3)] hover:border-[var(--neon-magenta)] active:scale-[0.95] active:shadow-[0_0_30px_rgba(195,0,255,0.5)]',
  'neon-green':
    'border-2 border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--surface-card)] hover:shadow-[0_0_20px_rgba(57,255,20,0.3)] hover:border-[var(--neon-green)] active:scale-[0.95] active:shadow-[0_0_30px_rgba(57,255,20,0.5)]',
  'neon-amber':
    'border-2 border-[var(--neon-amber)] text-[var(--neon-amber)] bg-[var(--surface-card)] hover:shadow-[0_0_20px_rgba(255,149,0,0.3)] hover:border-[var(--neon-amber)] active:scale-[0.95] active:shadow-[0_0_30px_rgba(255,149,0,0.5)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'secondary', size = 'md', asChild, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cx(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
