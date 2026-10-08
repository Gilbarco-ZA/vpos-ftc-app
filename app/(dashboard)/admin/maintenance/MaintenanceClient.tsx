'use client'

import type { LucideIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
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
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
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
  const [purgeKind, setPurgeKind] = useState<'transactions' | 'reports'>('transactions')
  const [purgeStart, setPurgeStart] = useState('')
  const [purgeEnd, setPurgeEnd] = useState('')
  const [purgePreview, setPurgePreview] = useState<any>(null)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  const [purgeConfirm, setPurgeConfirm] = useState('')
  const [purgeOutcome, setPurgeOutcome] = useState('')
  const [purgeError, setPurgeError] = useState('')
  const [isRefreshing, startRefresh] = useTransition()
  const forecourtSync = forecourtStatus?.data?.status ?? null

  const executePurge = async () => {
    if (!csrfToken || purgeKind !== 'transactions') return
    const expected = `PURGE TRANSACTIONS ${purgeStart} ${purgeEnd}`
    if (purgeConfirm !== expected) return
    setPurgeBusy(true)
    setPurgeError('')
    setPurgeOutcome('')
    try {
      const response = await fetch('/api/admin/system/purge/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          kind: purgeKind, startDate: purgeStart, endDate: purgeEnd,
          confirmation: purgeConfirm, csrf_token: csrfToken,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Could not perform purge.')
      }
      setPurgeOutcome(`Deleted ${payload.data?.deleted ?? 0} native fiscalized transactions (maximum 50 per operation). Recovery backup: ${payload.data?.backup ?? 'created'}.`)
      setPurgeConfirm('')
      setPurgePreview(null)
    } catch (error: any) {
      setPurgeError(String(error?.message || error))
    } finally {
      setPurgeBusy(false)
    }
  }

  const assessPurge = async () => {
    setPurgeBusy(true)
    setPurgeError('')
    setPurgePreview(null)
    setPurgeOutcome('')
    try {
      const params = new URLSearchParams({ kind: purgeKind, startDate: purgeStart, endDate: purgeEnd })
      const response = await fetch(`/api/admin/system/purge/preview?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Could not assess retention range.')
      }
      setPurgePreview(payload.data)
    } catch (error: any) {
      setPurgeError(String(error?.message || error))
    } finally {
      setPurgeBusy(false)
    }
  }

  const refreshStatus = () => {
    startRefresh(() => router.refresh())
  }

  return (
    <div className="space-y-6">
      <CsrfBootstrap onToken={setCsrfToken} />
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

      <section className="space-y-3" aria-labelledby="historical-retention">
        <h2 id="historical-retention" className="text-lg font-semibold">Transaction and report retention</h2>
        <Card>
          <CardHeader>
            <CardTitle>Historical data cleanup assessment</CardTitle>
            <CardDescription>
              Choose the record type and historical date range. Native fiscalized transactions
              are classified separately from legacy imports, which require cloud-delivery verification.
              No records are deleted by this assessment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Record type
                <select value={purgeKind} className="rounded border border-border bg-surface-card p-2"
                  onChange={(event) => { setPurgeKind(event.target.value as 'transactions' | 'reports'); setPurgePreview(null) }}>
                  <option value="transactions">Transactions</option>
                  <option value="reports">Reports</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                From
                <input type="date" className="rounded border border-border bg-surface-card p-2" value={purgeStart}
                  onChange={(event) => { setPurgeStart(event.target.value); setPurgePreview(null) }} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                To
                <input type="date" className="rounded border border-border bg-surface-card p-2" value={purgeEnd}
                  onChange={(event) => { setPurgeEnd(event.target.value); setPurgePreview(null) }} />
              </label>
              <Button variant="secondary" disabled={purgeBusy || !purgeStart || !purgeEnd || purgeStart > purgeEnd}
                onClick={() => void assessPurge()}>{purgeBusy ? 'Checking…' : 'Count records'}</Button>
            </div>
            {purgeOutcome ? <p role="status" className="text-sm">{purgeOutcome}</p> : null}
            {purgeError ? <p role="alert" className="text-sm text-red-600">{purgeError}</p> : null}
            {purgePreview ? (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-border p-3">
                    <div className="text-xs text-[var(--text-muted)]">Transactions</div>
                    <div className="text-lg font-semibold">{purgePreview.transactionsTotal}</div>
                  </div>
                  <div className="rounded border border-border p-3">
                    <div className="text-xs text-[var(--text-muted)]">Reports</div>
                    <div className="text-lg font-semibold">{purgePreview.reportsTotal}</div>
                  </div>
                </div>
                <p><strong>{purgePreview.total}</strong> {purgeKind} selected for assessment.</p>
                {purgeKind === 'transactions' ? (
                  <p>{purgePreview.nativeConfirmed} native fiscalized; {purgePreview.legacyOrUnverified} legacy, pending or unverified.</p>
                ) : null}
                <p className="text-[var(--text-secondary)]">{purgePreview.reason}</p>
                {purgeKind === 'transactions' && purgePreview.nativeConfirmed > 0 ? (
                  <div className="space-y-2 rounded border border-amber-400 p-3">
                    <p className="font-semibold">Purge native fiscalized transactions only</p>
                    <p>A database backup is created first. The server will delete up to 50 eligible records per operation, and block unsafe dependencies. Legacy records are excluded.</p>
                    <label className="block text-sm">
                      Type <code>{`PURGE TRANSACTIONS ${purgeStart} ${purgeEnd}`}</code>
                      <input className="mt-1 block w-full rounded border border-border bg-surface-card p-2"
                        value={purgeConfirm}
                        onChange={(event) => setPurgeConfirm(event.target.value)} />
                    </label>
                    <Button variant="destructive" disabled={purgeBusy || !csrfToken ||
                      purgeConfirm !== `PURGE TRANSACTIONS ${purgeStart} ${purgeEnd}`}
                      onClick={() => void executePurge()}>Purge up to 50 verified native transactions</Button>
                  </div>
                ) : null}
              </div>
            ) : null}
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
