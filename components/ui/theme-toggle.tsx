'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'

import { cx } from '@/src/shared/utils/cx'

const subscribe = () => () => {}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )

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

  const isDark = resolvedTheme === 'dark'
  const modeColor = isDark ? 'var(--neon-cyan)' : 'var(--neon-amber)'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      style={{
        borderColor: modeColor,
        boxShadow: `0 0 16px color-mix(in srgb, ${modeColor} 28%, transparent)`,
      }}
      className={cx(
        'group relative inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full bg-[var(--surface-card)] transition-all duration-300 ease-out hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]',
        className,
      )}
    >
      <span className="pointer-events-none flex w-full items-center justify-between px-2">
        <svg
          className={cx(
            'h-3.5 w-3.5 transition-all duration-300',
            isDark
              ? 'text-[var(--text-muted)] opacity-45'
              : 'text-[var(--neon-amber)] opacity-100',
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
        <svg
          className={cx(
            'h-3.5 w-3.5 transition-all duration-300',
            isDark
              ? 'text-[var(--neon-cyan)] opacity-100'
              : 'text-[var(--text-muted)] opacity-45',
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

      <span
        style={{
          backgroundColor: modeColor,
          boxShadow: `0 0 14px color-mix(in srgb, ${modeColor} 55%, transparent)`,
        }}
        className={cx(
          'pointer-events-none absolute top-1 h-7 w-7 rounded-full border border-white/20 transition-all duration-300 ease-out',
          isDark ? 'left-[calc(100%-2rem)]' : 'left-1',
        )}
      />
    </button>
  )
}
