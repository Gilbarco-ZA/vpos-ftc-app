'use client'

import { useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const metricValue = (bundle: any, name: string) => {
  const metrics = Array.isArray(bundle?.observability?.metrics)
    ? bundle.observability.metrics
    : []
  return metrics.find((metric: any) => metric?.name === name)?.value ?? '—'
}

const variantForStatus = (status: unknown) => {
  switch (String(status ?? '').toLowerCase()) {
    case 'healthy':
    case 'ok':
      return STATUS_VARIANT.SUCCESS
    case 'critical':
    case 'blocked':
    case 'error':
      return STATUS_VARIANT.ERROR
    case 'degraded':
    case 'warn':
    case 'warning':
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.INFO
  }
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
        {value == null || value === '' ? '—' : String(value)}
      </div>
    </div>
  )
}

export function JplSupportBundlePanel() {
  const [bundle, setBundle] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/support-bundle?inline=true&limit=50',
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to build support bundle')
      }
      setBundle(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to build support bundle')
    } finally {
      setLoading(false)
    }
  }

  const downloadHref = '/api/admin/forecourt/support-bundle?limit=200'

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Support bundle</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Download redacted DOMS/JPL diagnostics, recent protocol samples,
              reconciliation state, and maintenance safety state for support.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={load} disabled={loading}>
              {loading ? 'Preparing…' : 'Preview bundle summary'}
            </Button>
            <Button asChild variant="primary">
              <a href={downloadHref}>Download JSON</a>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {bundle ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={variantForStatus(bundle?.observability?.status)}>
                {bundle?.observability?.status ?? 'unknown'}
              </Badge>
              <span className="text-[var(--text-secondary)]">
                Generated {bundle?.generatedAt ?? '—'} • samples{' '}
                {bundle?.samples?.recentEvents?.length ?? 0}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Metric
                label="Reconnects"
                value={metricValue(bundle, 'reconnects')}
              />
              <Metric label="Rejects" value={metricValue(bundle, 'rejects')} />
              <Metric
                label="Heartbeat timeouts"
                value={metricValue(bundle, 'missedHeartbeatTimeouts')}
              />
              <Metric
                label="Stale locks"
                value={metricValue(bundle, 'staleLocks')}
              />
              <Metric
                label="Transaction read failures"
                value={metricValue(bundle, 'transactionReadFailures')}
              />
              <Metric
                label="Transaction clear failures"
                value={metricValue(bundle, 'transactionClearFailures')}
              />
              <Metric
                label="Service log backlog"
                value={metricValue(bundle, 'serviceLogBacklog')}
              />
              <Metric
                label="BOR backlog"
                value={metricValue(bundle, 'backOfficeRecordBacklog')}
              />
            </div>

            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Command latency sample
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
                {JSON.stringify(
                  bundle?.observability?.latency?.byCommand ?? [],
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        ) : (
          <div className="rounded border bg-[var(--surface-card)] p-3 text-sm text-[var(--text-secondary)]">
            Preview is optional. The download action builds the full redacted
            support bundle on demand.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
