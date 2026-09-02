import { ReactNode } from 'react'
import Link from 'next/link'

import { cx } from '@/src/shared/utils/cx'

import { ThemeToggle } from '@/components/ui/theme-toggle'

export type BreadcrumbItem = {
  label: string
  href?: string
}

export type TopbarProps = {
  breadcrumbs?: ReactNode
  title?: string
  context?: ReactNode
  actions?: ReactNode
  leading?: ReactNode
  className?: string
}

export const Topbar = ({
  breadcrumbs,
  title,
  context,
  actions,
  leading,
  className,
}: TopbarProps) => {
  return (
    <header
      className={cx(
        'bg-[var(--surface-page)]/80 relative min-h-20 border-b border-[var(--border-default)] backdrop-blur-xl transition-all duration-300',
        'shadow-sm hover:shadow-[0_0_20px_rgba(0,245,255,0.1)]',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)] to-transparent opacity-30"></div>
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 xl:px-8">
        {/* Leading slot (hamburger on mobile) */}
        {leading ? (
          <div className="flex shrink-0 items-center">{leading}</div>
        ) : null}

        {/* Breadcrumbs / title */}
        <div className="min-w-0 flex-1">
          {breadcrumbs ??
            (title && (
              <div className="animate-glow-pulse truncate text-sm font-medium text-[var(--neon-cyan)]">
                {title}
              </div>
            ))}
        </div>

        {/* Right-side: context chip + actions + theme toggle */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {context && (
            <div className="hidden min-w-0 sm:block sm:max-w-xs lg:max-w-sm">
              {context}
            </div>
          )}
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export type TopbarBreadcrumbsProps = {
  items: BreadcrumbItem[]
}

export const TopbarBreadcrumbs = ({ items }: TopbarBreadcrumbsProps) => {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center gap-2"
            >
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="font-medium text-[var(--text-muted)] transition-colors duration-200 hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className="text-[var(--border-strong)]">/</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
