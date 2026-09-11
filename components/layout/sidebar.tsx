'use client'

import type { UserRole } from '@/src/shared/types'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

import { isTanzaniaCountry } from '@/src/shared/config/country'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { RuntimeImage } from '@/components/ui/runtime-image'

type NavItem = { label: string; href: string; exact?: boolean }
type NavSection = { label?: string; items: NavItem[] }

export type SidebarBranding = {
  stationDisplayName?: string | null
  logoPath?: string | null
}

export const getNavSections = (
  role: UserRole,
  stationCountry?: string | null,
  tinCaptureOrder?: 'before_transaction' | 'after_transaction' | null,
): NavSection[] => {
  const dashboard: NavSection = {
    items: [{ label: 'Dashboard', href: '/dashboard' }],
  }
  const dailyOperations: NavSection = {
    label: 'Daily Operations',
    items: [
      { label: 'POS', href: '/pos' },
      ...(tinCaptureOrder === 'before_transaction'
        ? [{ label: 'TIN Allocation', href: '/tin-allocation' }]
        : []),
      { label: 'Transactions', href: '/transactions' },
      { label: 'Receipts', href: '/receipts' },
      { label: 'Reports', href: '/reports' },
      ...(isTanzaniaCountry(stationCountry)
        ? [{ label: 'Daily Totals', href: '/tanzania/daily-totals' }]
        : []),
      { label: 'Customers', href: '/customers' },
      { label: 'Product Stock', href: '/stock' },
    ],
  }

  if (role === 'tenant') {
    const allowed = [
      '/pos',
      '/tin-allocation',
      '/transactions',
      '/receipts',
      '/customers',
    ]
    return [
      dashboard,
      {
        ...dailyOperations,
        items: dailyOperations.items.filter((item) =>
          allowed.includes(item.href),
        ),
      },
    ]
  }

  if (role === 'manager') {
    return [
      dashboard,
      dailyOperations,
      {
        label: 'Transaction Review',
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
          { label: 'Receipt Lookup', href: '/manager/receipt' },
        ],
      },
      {
        label: 'Forecourt',
        items: [
          { label: 'Pumps', href: '/pumps' },
          { label: 'Tanks', href: '/tanks' },
          { label: 'Tank Levels', href: '/tank-levels' },
        ],
      },
      {
        label: 'Setup & Configuration',
        items: [
          { label: 'Pump Settings', href: '/settings/pumps' },
          { label: 'Tank Settings', href: '/settings/tanks' },
          { label: 'Tank Grades', href: '/settings/tank-grades' },
          { label: 'Forecourt Setup', href: '/setup/forecourt' },
          { label: 'Forecourt Pricing', href: '/setup/forecourt/pricing' },
        ],
      },
    ]
  }

  return [
    dashboard,
    dailyOperations,
    {
      label: 'Transaction Review',
      items: [
        { label: 'Fiscal Inbox', href: '/transaction/fiscal-inbox' },
        {
          label: 'Non-fiscalized',
          href: '/transactions?status=non-fiscalized',
        },
        { label: 'Fiscalized', href: '/transactions?status=fiscalized' },
        {
          label: 'Receipt Viewer',
          href: '/transactions?status=fiscalized&view=receipt',
        },
        { label: 'Receipt Lookup', href: '/manager/receipt' },
      ],
    },
    {
      label: 'Forecourt Operations',
      items: [
        { label: 'Pumps', href: '/pumps' },
        { label: 'Tanks', href: '/tanks' },
        { label: 'Tank Levels', href: '/tank-levels' },
        { label: 'Forecourt Monitor', href: '/admin/forecourt' },
        { label: 'Device Status', href: '/admin/device-setup' },
        { label: 'Print Jobs', href: '/admin/print-jobs' },
        { label: 'Diagnostics', href: '/admin/diagnostics' },
      ],
    },
    {
      label: 'Fiscal Services',
      items: [
        ...(isTanzaniaCountry(stationCountry)
          ? [{ label: 'Tanzania Fiscal', href: '/admin/tanzania-fiscal' }]
          : []),
        { label: 'Proxy Settings', href: '/admin/proxy-settings' },
      ],
    },
    {
      label: 'Administration',
      items: [
        { label: 'Users', href: '/admin/users' },
        { label: 'Runtime Control', href: '/admin/control' },
        { label: 'Maintenance', href: '/admin/maintenance' },
      ],
    },
    {
      label: 'Setup & Configuration',
      items: [
        { label: 'Setup Wizard', href: '/admin/setup' },
        { label: 'Forecourt Setup', href: '/setup/forecourt' },
        { label: 'Forecourt Pricing', href: '/setup/forecourt/pricing' },
        { label: 'Products', href: '/admin/products', exact: true },
        { label: 'Product Categories', href: '/admin/products/categories' },
        { label: 'Pump Settings', href: '/settings/pumps' },
        { label: 'Pump Mode', href: '/admin/settings/pump-mode' },
        { label: 'Tank Settings', href: '/settings/tanks' },
        { label: 'Tank Grades', href: '/settings/tank-grades' },
        { label: 'Station Settings', href: '/admin/settings' },
        { label: 'Station Config', href: '/admin/config' },
        { label: 'Printers', href: '/admin/config/printers' },
        { label: 'Country Datasets', href: '/admin/datasets' },
        { label: 'Languages', href: '/admin/languages' },
        { label: 'Branding', href: '/admin/branding' },
      ],
    },
  ]
}

export type SidebarProps = {
  role: UserRole
  stationCountry?: string | null
  tinCaptureOrder?: 'before_transaction' | 'after_transaction' | null
  branding?: SidebarBranding
}

type SidebarContentProps = SidebarProps & {
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
  exact = false,
) => {
  const [targetPath, targetQuery = ''] = href.split('?')
  const pathMatches =
    exact || targetPath === '/dashboard'
      ? pathname === targetPath
      : pathname === targetPath || pathname.startsWith(`${targetPath}/`)
  if (!pathMatches) return false
  if (!targetQuery) return true
  const expected = new URLSearchParams(targetQuery)
  for (const [key, value] of expected.entries())
    if (currentSearchParams.get(key) !== value) return false
  return true
}

export const SidebarContent = ({
  role,
  stationCountry,
  tinCaptureOrder,
  branding,
  collapsed,
  showCollapseToggle = true,
  onToggleCollapsed,
  onNavigate,
  className,
}: SidebarContentProps) => {
  const pathname = usePathname() ?? '/'
  const searchParams = useSearchParams()
  const sections = useMemo(
    () => getNavSections(role, stationCountry, tinCaptureOrder),
    [role, stationCountry, tinCaptureOrder],
  )
  const currentSearchParams = useMemo(
    () => new URLSearchParams(searchParams?.toString() || ''),
    [searchParams],
  )
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(['Daily Operations']),
  )
  const [csrfToken, setCsrfToken] = useState('')
  const brandInitials = useMemo(() => {
    const source = String(branding?.stationDisplayName || 'VPOS FTC').trim()
    return (
      source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'VF'
    )
  }, [branding?.stationDisplayName])

  return (
    <div className={className}>
      <div className="bg-[var(--surface-page)]/90 flex min-h-20 items-center border-b border-[var(--border-default)] px-4 shadow-[var(--shadow-glow-cyan)] backdrop-blur-xl">
        <div className="flex w-full items-start justify-between gap-3">
          <div className={collapsed ? 'sr-only' : 'animate-fade-in'}>
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 border-[var(--neon-cyan)] bg-[var(--surface-muted)]">
                {branding?.logoPath ? (
                  <RuntimeImage
                    src={branding.logoPath}
                    alt={`${branding.stationDisplayName || 'Station'} logo`}
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : (
                  <span className="text-xs font-semibold">{brandInitials}</span>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {branding?.stationDisplayName || 'VPOS FTC'}
                </div>
                <div className="text-sm font-semibold">Operations</div>
              </div>
            </div>
          </div>
          {showCollapseToggle ? (
            <button
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={onToggleCollapsed}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)]"
            >
              {collapsed ? '›' : '‹'}
            </button>
          ) : null}
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {sections.map((section, index) => {
          const key = section.label ?? `primary-${index}`
          const activeSection = section.items.some((item) =>
            isActiveRoute(pathname, currentSearchParams, item.href, item.exact),
          )
          const expanded =
            !section.label ||
            collapsed ||
            activeSection ||
            openSections.has(key)
          return (
            <div key={key} className="space-y-1">
              {section.label ? (
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((current) => {
                      const next = new Set(current)
                      next.has(key) ? next.delete(key) : next.add(key)
                      return next
                    })
                  }
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"
                >
                  <span className={collapsed ? 'sr-only' : ''}>
                    {section.label}
                  </span>
                  {!collapsed ? (
                    <ChevronDown
                      className={`h-3.5 w-3.5 ${expanded ? '' : '-rotate-90'}`}
                    />
                  ) : null}
                </button>
              ) : null}
              {expanded ? (
                <div
                  className={
                    section.label && !collapsed
                      ? 'ml-2 space-y-0.5 border-l border-[var(--border-default)] pl-2'
                      : 'space-y-0.5'
                  }
                >
                  {section.items.map((item) => {
                    const active = isActiveRoute(
                      pathname,
                      currentSearchParams,
                      item.href,
                      item.exact,
                    )
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={`group relative flex items-center rounded-lg border px-3 py-2 text-[13px] font-medium ${active ? 'border-[var(--border-neon-cyan)] text-[var(--neon-cyan)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'} ${collapsed ? 'justify-center px-2' : ''}`}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className={collapsed ? 'sr-only' : ''}>
                          {item.label}
                        </span>
                        {collapsed ? (
                          <span aria-hidden>
                            {item.label.slice(0, 2).toUpperCase()}
                          </span>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--border-default)] px-3 py-4">
        <form method="post" action="/api/auth/logout">
          <CsrfBootstrap onToken={setCsrfToken} />
          <CsrfHiddenInput token={csrfToken} />
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start"
            disabled={!csrfToken}
          >
            <span className={collapsed ? 'sr-only' : ''}>Sign out</span>
          </Button>
        </form>
      </div>
    </div>
  )
}

export const Sidebar = ({
  role,
  stationCountry,
  tinCaptureOrder,
  branding,
}: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col border-r border-[var(--border-default)] bg-[var(--surface-page)] transition-all ${collapsed ? 'w-[72px]' : 'w-64'}`}
    >
      <SidebarContent
        role={role}
        stationCountry={stationCountry}
        tinCaptureOrder={tinCaptureOrder}
        branding={branding}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        showCollapseToggle
        className="flex h-full flex-col"
      />
    </aside>
  )
}
