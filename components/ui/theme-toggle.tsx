'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

import { cx } from '@/src/shared/utils/cx'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div
        className={cx(
          'h-9 w-16 rounded-full border border-[var(--border-default)] bg-[var(--surface-muted)]',
          className,
        )}
        aria-hidden
      />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cx(
        'group relative inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-hover)] transition-all duration-300 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]',
        className,
      )}
    >
      <span className="pointer-events-none flex w-full items-center justify-between px-2">
        {/* Sun icon (light side) */}
        <svg
          className={cx(
            'h-3.5 w-3.5 transition-all duration-300',
            isDark
              ? 'text-[var(--text-muted)] opacity-50'
              : 'text-amber-500 opacity-100',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        {/* Moon icon (dark side) */}
        <svg
          className={cx(
            'h-3.5 w-3.5 transition-all duration-300',
            isDark
              ? 'text-blue-400 opacity-100'
              : 'text-[var(--text-muted)] opacity-50',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>

      {/* Thumb */}
      <span
        className={cx(
          'pointer-events-none absolute top-1 h-7 w-7 rounded-full border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-sm transition-all duration-300 ease-out',
          isDark ? 'left-1' : 'left-[calc(100%-2rem)]',
        )}
      />
    </button>
  )
}
