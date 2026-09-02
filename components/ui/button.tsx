import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cx } from '@/src/shared/utils/cx'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'neon-cyan'
  | 'neon-magenta'
  | 'neon-green'
  | 'neon-amber'
type ButtonSize = 'sm' | 'md' | 'lg'

const baseStyles =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]'

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'border border-[var(--neon-cyan)] bg-[var(--neon-cyan)] text-[var(--neon-primary-foreground,#031316)] shadow-[var(--shadow-glow-cyan)] hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_30px_var(--neon-cyan)] focus-visible:ring-[var(--neon-cyan)]',
  secondary:
    'border border-[var(--neon-magenta)] bg-[color-mix(in_srgb,var(--neon-magenta)_12%,transparent)] text-[var(--neon-magenta)] shadow-[var(--shadow-glow-magenta)] backdrop-blur-sm hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--neon-magenta)_20%,transparent)] hover:shadow-[0_0_30px_var(--neon-magenta)] focus-visible:ring-[var(--neon-magenta)]',
  ghost:
    'border border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-neon-cyan)] hover:bg-[color-mix(in_srgb,var(--neon-cyan)_8%,transparent)] hover:text-[var(--neon-cyan)]',
  destructive:
    'border border-red-500/30 bg-red-500/10 text-red-500 shadow-card hover:border-red-500/50 hover:bg-red-500/20 hover:shadow-elevated',
  'neon-cyan':
    'border border-[var(--neon-cyan)] bg-[color-mix(in_srgb,var(--neon-cyan)_12%,transparent)] text-[var(--neon-cyan)] shadow-[var(--shadow-glow-cyan)] hover:bg-[color-mix(in_srgb,var(--neon-cyan)_20%,transparent)] hover:shadow-[0_0_30px_var(--neon-cyan)] focus-visible:ring-[var(--neon-cyan)]',
  'neon-magenta':
    'border border-[var(--neon-magenta)] bg-[color-mix(in_srgb,var(--neon-magenta)_12%,transparent)] text-[var(--neon-magenta)] shadow-[var(--shadow-glow-magenta)] hover:bg-[color-mix(in_srgb,var(--neon-magenta)_20%,transparent)] hover:shadow-[0_0_30px_var(--neon-magenta)] focus-visible:ring-[var(--neon-magenta)]',
  'neon-green':
    'border border-[var(--neon-green)] bg-[color-mix(in_srgb,var(--neon-green)_12%,transparent)] text-[var(--neon-green)] shadow-[var(--shadow-glow-green)] hover:bg-[color-mix(in_srgb,var(--neon-green)_20%,transparent)] hover:shadow-[0_0_30px_var(--neon-green)] focus-visible:ring-[var(--neon-green)]',
  'neon-amber':
    'border border-[var(--neon-amber)] bg-[color-mix(in_srgb,var(--neon-amber)_12%,transparent)] text-[var(--neon-amber)] shadow-[var(--shadow-glow-amber)] hover:bg-[color-mix(in_srgb,var(--neon-amber)_20%,transparent)] hover:shadow-[0_0_30px_var(--neon-amber)] focus-visible:ring-[var(--neon-amber)]',
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
