'use client'

import type { UserRole } from '@/src/shared/types'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'

type NavItem = {
  label: string
  href: string
}

type NavSection = {
  label?: string
  items: NavItem[]
}

export type SidebarBranding = {
  stationDisplayName?: string | null
  logoPath?: string | null
}

const getNavSections = (role: UserRole): NavSection[] => {
  const common: NavSection[] = [
    {
      items: [{ label: 'Dashboard', href: '/dashboard' }],
    },
  ]

  if (role === 'tenant') {
    return [
      ...common,
      {
        label: 'Operations',
        items: [
          { label: 'Customers', href: '/customers' },
          { label: 'Transactions', href: '/transactions' },
          { label: 'POS', href: '/pos' },
          { label: 'Receipts', href: '/receipts' },
        ],
      },
    ]
  }

  if (role === 'manager') {
    return [
      ...common,
      {
        label: 'Operations',
        items: [
          { label: 'Customers', href: '/customers' },
          { label: 'POS', href: '/pos' },
          { label: 'Receipts', href: '/receipts' },
          { label: 'Reports', href: '/reports' },
        ],
      },
      {
        label: 'Fiscalization',
        items: [
          {
            label: 'Non-fiscalized',
            href: '/transactions?status=non-fiscalized',
          },
          { label: 'Fiscalized', href: '/transactions?status=fiscalized' },
          {
            label: 'Receipt Viewer',
            href: '/transactions?status=fiscalized&view=receipt',
          },
        ],
      },
      {
        label: 'Devices',
        items: [
          { label: 'Pumps', href: '/pumps' },
          { label: 'Tanks', href: '/tanks' },
          { label: 'Tank Levels', href: '/tank-levels' },
        ],
      },
      {
        label: 'Configuration',
        items: [
          { label: 'Pump Settings', href: '/settings/pumps' },
          { label: 'Tank Settings', href: '/settings/tanks' },
          { label: 'Tank Grades', href: '/settings/tank-grades' },
          { label: 'Forecourt Setup', href: '/setup/forecourt' },
        ],
      },
    ]
  }

  return [
    ...common,
    {
      label: 'Fiscalization',
      items: [
        { label: 'Fiscal Inbox', href: '/transaction/fiscal-inbox' },
        { label: 'POS', href: '/pos' },
        {
          label: 'Non-fiscalized',
          href: '/transactions?status=non-fiscalized',
        },
        { label: 'Fiscalized', href: '/transactions?status=fiscalized' },
        {
          label: 'Receipt Viewer',
          href: '/transactions?status=fiscalized&view=receipt',
        },
        { label: 'Receipts', href: '/receipts' },
        { label: 'Reports', href: '/reports' },
      ],
    },
    {
      label: 'Setup',
      items: [
        { label: 'Setup Wizard', href: '/admin/setup' },
        { label: 'Forecourt Setup', href: '/setup/forecourt' },
        { label: 'Products', href: '/admin/products' },
        { label: 'Branding', href: '/admin/branding' },
        { label: 'Station Config', href: '/admin/config' },
        { label: 'Printers', href: '/admin/config/printers' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Users', href: '/admin/users' },
        { label: 'Customers', href: '/customers' },
        { label: 'Station Settings', href: '/admin/settings' },
        { label: 'Proxy Settings', href: '/admin/proxy-settings' },
        { label: 'Sync', href: '/admin/sync' },
        { label: 'Control', href: '/admin/control' },
        { label: 'Forecourt Monitor', href: '/admin/forecourt' },
        { label: 'EWURA', href: '/admin/ewura' },
      ],
    },
    {
      label: 'Devices',
      items: [
        { label: 'Pumps', href: '/pumps' },
        { label: 'Pump Settings', href: '/settings/pumps' },
        { label: 'Pump Mode', href: '/admin/settings/pump-mode' },
        { label: 'Tanks', href: '/tanks' },
        { label: 'Tank Settings', href: '/settings/tanks' },
        { label: 'Tank Grades', href: '/settings/tank-grades' },
        { label: 'Tank Levels', href: '/tank-levels' },
        { label: 'Device Status', href: '/admin/device-setup' },
        { label: 'Diagnostics', href: '/admin/diagnostics' },
      ],
    },
  ]
}

export type SidebarProps = {
  role: UserRole
  branding?: SidebarBranding
}

type SidebarContentProps = {
  role: UserRole
  branding?: SidebarBranding
  collapsed: boolean
  showCollapseToggle?: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
  className?: string
}

const isActiveRoute = (
  pathname: string,
  currentSearchParams: URLSearchParams,
  href: string,
) => {
  const [targetPath, targetQuery = ''] = href.split('?')
  const pathMatches =
    targetPath === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === targetPath || pathname.startsWith(`${targetPath}/`)

  if (!pathMatches) return false
  if (!targetQuery) return true

  const expected = new URLSearchParams(targetQuery)
  for (const [key, value] of expected.entries()) {
    if (currentSearchParams.get(key) !== value) return false
  }
  return true
}

export const SidebarContent = ({
  role,
  branding,
  collapsed,
  showCollapseToggle = true,
  onToggleCollapsed,
  onNavigate,
  className,
}: SidebarContentProps) => {
  const pathname = usePathname() ?? '/'
  const searchParams = useSearchParams()
  const sections = getNavSections(role)
  const [csrfToken, setCsrfToken] = useState('')

  const brandInitials = useMemo(() => {
    const source = String(branding?.stationDisplayName || 'VPOS FTC').trim()
    const initials = source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
    return initials || 'VF'
  }, [branding?.stationDisplayName])

  return (
    <div className={className}>
      {/* Header with branding */}
      <div className="border-b border-[var(--border-default)] px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className={collapsed ? 'sr-only' : 'animate-fade-in'}>
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] transition-all duration-300 hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)]">
                {branding?.logoPath ? (
                  <img
                    src={branding.logoPath}
                    alt={`${branding.stationDisplayName || 'Station'} logo`}
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : (
                  <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
                    {brandInitials}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {branding?.stationDisplayName || 'VPOS FTC'}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                  Operations
                </div>
              </div>
            </div>
          </div>

          {showCollapseToggle ? (
            <button
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={onToggleCollapsed}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-muted)] transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            >
              {collapsed ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {sections.map((section, index) => (
          <div
            key={`${section.label ?? 'section'}-${index}`}
            className="space-y-1.5"
          >
            {section.label && (
              <div
                className={
                  'mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] ' +
                  (collapsed ? 'sr-only' : '')
                }
              >
                {section.label}
              </div>
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActiveRoute(
                  pathname,
                  new URLSearchParams(searchParams?.toString() || ''),
                  item.href,
                )
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={
                      'group relative flex items-center rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 ' +
                      (active
                        ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]') +
                      (collapsed ? ' justify-center' : '')
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    {/* Active indicator */}
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-500 transition-all duration-300" />
                    )}
                    <span className={collapsed ? 'sr-only' : ''}>
                      {item.label}
                    </span>
                    {collapsed ? (
                      <span
                        aria-hidden
                        className="text-[10px] font-semibold tracking-wide"
                      >
                        {item.label.slice(0, 2).toUpperCase()}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-[var(--border-default)] px-3 py-4">
        <form method="post" action="/api/auth/logout" className="space-y-3">
          <CsrfBootstrap onToken={setCsrfToken} />
          <CsrfHiddenInput token={csrfToken} />
          <div className={collapsed ? 'hidden' : 'mb-3 px-1'}>
            <div className="flex items-center gap-2">
              <div className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Secure Session
              </div>
            </div>
          </div>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-[13px] font-medium text-[var(--text-muted)] transition-all duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            disabled={!csrfToken}
            title={!csrfToken ? 'Loading CSRF token…' : undefined}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className={collapsed ? 'sr-only' : ''}>Sign out</span>
          </Button>
        </form>
      </div>
    </div>
  )
}

export const Sidebar = ({ role, branding }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={
        'sticky top-0 flex h-screen flex-col border-r border-[var(--border-default)] bg-[var(--surface-page)] shadow-sm transition-all duration-300 ease-out ' +
        (collapsed ? 'w-[72px]' : 'w-64')
      }
    >
      <SidebarContent
        role={role}
        branding={branding}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        showCollapseToggle
        className="flex h-full flex-col"
      />
    </aside>
  )
}
