'use client'

import { ForecourtSyncButton } from '@/components/sync/ForecourtSyncButton'
import { SyncNowButton } from '@/components/sync/SyncNowButton'
import { StatCard } from '@/components/ui/stat-card'

const formatDateTime = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  return isFinite(d.getTime()) ? d.toLocaleString() : String(v)
}

export function AdminSyncClient({
  status,
  forecourtStatus,
}: {
  status: any
  forecourtStatus: any
}) {
  const s: any = status?.data ?? null
  const fs = forecourtStatus?.data?.status ?? null

  return (
    <>
      <div className="space-y-4 rounded border bg-[var(--surface-card)] p-4">
        <h2 className="font-semibold">Run Sync Now</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Run an on-demand sync between local machine storage and cloud storage.
        </p>
        <SyncNowButton />
      </div>

      <div className="space-y-4 rounded border bg-[var(--surface-card)] p-4">
        <h2 className="font-semibold">Forecourt Config Sync</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Pull forecourt products, tanks, pumps, and nozzles from DOMS.
        </p>
        <ForecourtSyncButton />
      </div>

      <div className="rounded border bg-[var(--surface-card)] p-4">
        <h2 className="mb-3 font-semibold">Status</h2>

        {s ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard
              label="Last sync"
              value={formatDateTime(s?.last_sync_at || s?.lastSyncAt)}
            />
            <StatCard
              label="In progress"
              value={String(Boolean(s?.sync_in_progress ?? s?.syncInProgress))}
            />
            <StatCard
              label="Last result"
              value={String(s?.last_result || s?.lastResult || '—')}
            />
          </div>
        ) : (
          <div className="rounded border bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">
            No sync status found yet.
          </div>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--text-secondary)]">
            Raw JSON
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(status, null, 2)}
          </pre>
        </details>
      </div>

      <div className="rounded border bg-[var(--surface-card)] p-4">
        <h2 className="mb-3 font-semibold">Forecourt Status</h2>

        {fs ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard label="Last sync" value={formatDateTime(fs.lastSyncAt)} />
            <StatCard label="Result" value={String(fs.ok ?? false)} />
            <StatCard
              label="Counts"
              value={
                fs.counts
                  ? `P:${fs.counts.products} T:${fs.counts.tanks} Pump:${fs.counts.pumps} N:${fs.counts.nozzles}`
                  : '—'
              }
            />
          </div>
        ) : (
          <div className="rounded border bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">
            No forecourt sync status found yet.
          </div>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--text-secondary)]">
            Raw JSON
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(forecourtStatus, null, 2)}
          </pre>
        </details>
      </div>
    </>
  )
}
