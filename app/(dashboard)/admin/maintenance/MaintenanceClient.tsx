'use client'

import type { LucideIcon } from 'lucide-react'
import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  Fuel,
  Gauge,
  Printer,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'

import { ForecourtSyncButton } from '@/components/sync/ForecourtSyncButton'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'

const formatDateTime = (value: unknown) => {
  if (!value) return 'Not run yet'
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value)
}

type MaintenanceLinkProps = {
  description: string
  href: string
  icon: LucideIcon
  title: string
}

const MaintenanceLink = ({
  description,
  href,
  icon: Icon,
  title,
}: MaintenanceLinkProps) => (
  <Link
    href={href}
    className="group rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-card transition hover:-translate-y-0.5 hover:border-[var(--neon-cyan)] hover:shadow-[0_0_20px_rgba(0,245,255,0.1)]"
  >
    <div className="flex items-start gap-3">
      <div className="rounded-lg border border-[var(--border-neon-cyan)] bg-[color-mix(in_srgb,var(--neon-cyan)_8%,transparent)] p-2 text-[var(--neon-cyan)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="font-medium text-[var(--text-primary)] group-hover:text-[var(--neon-cyan)]">
          {title}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      </div>
    </div>
  </Link>
)

export function MaintenanceClient({
  forecourtStatus,
}: {
  forecourtStatus: any
}) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const forecourtSync = forecourtStatus?.data?.status ?? null

  const refreshStatus = () => {
    startRefresh(() => router.refresh())
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-400/80">
            Administration
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
            Maintenance
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            Manual recovery and diagnostic tools for this station. Cloud-bound
            operational data is delivered through vpos-proxy; use the focused
            actions below for forecourt refresh and service recovery.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={refreshStatus}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {isRefreshing ? 'Refreshing' : 'Refresh status'}
        </Button>
      </div>

      <section className="space-y-3" aria-labelledby="maintenance-actions">
        <div>
          <h2
            id="maintenance-actions"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Manual actions
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Run only the operation required for the current incident or setup
            change.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Forecourt configuration refresh</CardTitle>
            <CardDescription>
              Pull products, tanks, pumps, nozzles, and optional tank status
              from DOMS into the application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForecourtSyncButton onComplete={refreshStatus} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="maintenance-status">
        <div>
          <h2
            id="maintenance-status"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Current status
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Latest recorded result for forecourt synchronization. Cloud queue
            and delivery state is owned by vpos-proxy.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <StatCard
            label="Forecourt last sync"
            value={formatDateTime(forecourtSync?.lastSyncAt)}
          />
          <StatCard
            label="Forecourt result"
            value={
              forecourtSync
                ? forecourtSync.ok
                  ? 'Successful'
                  : 'Failed'
                : 'Unknown'
            }
          />
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-3 sm:pt-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Products
              </div>
              <div className="mt-1 font-medium text-[var(--text-primary)]">
                {forecourtSync?.counts?.products ?? '-'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Tanks / pumps
              </div>
              <div className="mt-1 font-medium text-[var(--text-primary)]">
                {forecourtSync?.counts
                  ? `${forecourtSync.counts.tanks ?? 0} / ${forecourtSync.counts.pumps ?? 0}`
                  : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Nozzles
              </div>
              <div className="mt-1 font-medium text-[var(--text-primary)]">
                {forecourtSync?.counts?.nozzles ?? '-'}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="maintenance-tools">
        <div>
          <h2
            id="maintenance-tools"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Operational tools
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Focused pages for service control, diagnostics, fiscal services, and
            station configuration.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MaintenanceLink
            href="/admin/control"
            icon={SlidersHorizontal}
            title="Runtime control"
            description="Restart or control station services and review command events."
          />
          <MaintenanceLink
            href="/admin/diagnostics"
            icon={Activity}
            title="Diagnostics and logs"
            description="Inspect service health, application logs, and support evidence."
          />
          <MaintenanceLink
            href="/admin/device-setup"
            icon={Gauge}
            title="Device status"
            description="Review connected hardware and device readiness."
          />
          <MaintenanceLink
            href="/admin/forecourt"
            icon={Fuel}
            title="Forecourt monitor"
            description="Inspect DOMS connectivity and forecourt operational state."
          />
          <MaintenanceLink
            href="/admin/tanzania-fiscal"
            icon={ShieldCheck}
            title="Tanzania fiscal"
            description="Validate TRA registration, credentials, routing, and responses."
          />
          <MaintenanceLink
            href="/admin/config/printers"
            icon={Printer}
            title="Printer configuration"
            description="Configure receipt printers and verify output routing."
          />
          <MaintenanceLink
            href="/admin/config"
            icon={Settings}
            title="Station configuration"
            description="Review effective station and service configuration."
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Technical details</CardTitle>
          <CardDescription>
            Raw forecourt payload for support and troubleshooting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
              Forecourt synchronization payload
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3 text-xs">
              {JSON.stringify(forecourtStatus, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
