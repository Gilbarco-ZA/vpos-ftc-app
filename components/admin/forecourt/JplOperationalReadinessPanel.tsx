'use client'

import { useCallback, useEffect, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const statusVariant = (status: unknown) => {
  const normalized = String(status ?? '').toLowerCase()
  if (['ready', 'passed', 'ok'].includes(normalized)) {
    return STATUS_VARIANT.SUCCESS
  }
  if (['blocked', 'critical', 'failed', 'error'].includes(normalized)) {
    return STATUS_VARIANT.ERROR
  }
  if (['degraded', 'warning', 'pending'].includes(normalized)) {
    return STATUS_VARIANT.NEUTRAL
  }
  return STATUS_VARIANT.INFO
}

const fmtValue = (value: unknown) => {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const ts = new Date(String(value)).getTime()
  if (!Number.isFinite(ts)) return String(value)
  return new Date(ts).toLocaleString()
}

export function JplOperationalReadinessPanel() {
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/operational-readiness',
      )
      if (!response.success) {
        throw new Error(
          response.error || 'Failed to load DOMS operational readiness',
        )
      }
      setPayload(response.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load DOMS operational readiness')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const sections = payload?.sections ?? []
  const actionItems = payload?.actionItems ?? []
  const summary = payload?.summary ?? {}
  const operatorDecision = payload?.operatorDecision ?? {}

  return (
    <CollapsibleStatusSection
      title="DOMS operational readiness"
      status={payload?.overallStatus ?? 'unknown'}
      statusVariant={statusVariant(payload?.overallStatus)}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Operator-facing health rollup from the typed runtime snapshot,
            release-gate evidence, and DOMS/PSS status flags.
          </p>
          <Button type="button" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh readiness'}
          </Button>
        </div>

        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Blocking actions
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {summary.blockingActionCount ?? 0}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Critical actions
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {summary.criticalActionCount ?? 0}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Warning actions
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {summary.warningActionCount ?? 0}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Ready sections
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {summary.readySectionCount ?? 0}
            </div>
          </div>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3 text-sm">
          <div className="font-semibold">Operator decision</div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Live operations
              </div>
              <Badge
                variant={statusVariant(
                  operatorDecision.canProceedWithLiveOperations
                    ? 'ready'
                    : 'blocked',
                )}
              >
                {operatorDecision.canProceedWithLiveOperations
                  ? 'can proceed'
                  : 'blocked'}
              </Badge>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Commissioning
              </div>
              <Badge
                variant={statusVariant(
                  operatorDecision.canProceedWithCommissioning
                    ? 'ready'
                    : 'blocked',
                )}
              >
                {operatorDecision.canProceedWithCommissioning
                  ? 'can proceed'
                  : 'blocked'}
              </Badge>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Field engineer
              </div>
              <Badge
                variant={statusVariant(
                  operatorDecision.requiresFieldEngineer ? 'critical' : 'ready',
                )}
              >
                {operatorDecision.requiresFieldEngineer
                  ? 'required'
                  : 'not required'}
              </Badge>
            </div>
          </div>
          <div className="mt-3 text-xs text-[var(--text-secondary)]">
            Next best action: {operatorDecision.nextBestAction ?? '—'}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Generated: {fmtTs(payload?.generatedAt)}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {sections.map((section: any) => (
            <div
              key={section.id}
              className="space-y-3 rounded border bg-[var(--surface-card)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{section.title}</div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {section.summary}
                  </p>
                </div>
                <Badge variant={statusVariant(section.status)}>
                  {section.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                {Object.entries(section.metrics ?? {})
                  .slice(0, 9)
                  .map(([key, value]) => (
                    <div key={key} className="rounded border p-2">
                      <div className="truncate text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        {key}
                      </div>
                      <div className="mt-1 truncate font-medium">
                        {fmtValue(value)}
                      </div>
                    </div>
                  ))}
              </div>

              {section.actionItems?.length ? (
                <div className="space-y-2">
                  {section.actionItems.slice(0, 4).map((item: any) => (
                    <div key={item.id} className="rounded border p-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{item.title}</div>
                        <Badge variant={statusVariant(item.severity)}>
                          {item.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[var(--text-secondary)]">
                        {item.description}
                      </p>
                      <p className="mt-1 text-[var(--text-muted)]">
                        Next: {item.nextAction}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)]">
                  No operator action required for this section.
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded border bg-[var(--surface-card)] p-3">
          <div className="text-sm font-semibold">Top action queue</div>
          {actionItems.length ? (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Domain</th>
                    <th className="px-2 py-1">Severity</th>
                    <th className="px-2 py-1">Action</th>
                    <th className="px-2 py-1">Blocks</th>
                  </tr>
                </thead>
                <tbody>
                  {actionItems.slice(0, 12).map((item: any) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-2 py-1">{item.domain}</td>
                      <td className="px-2 py-1">
                        <Badge variant={statusVariant(item.severity)}>
                          {item.severity}
                        </Badge>
                      </td>
                      <td className="px-2 py-1">{item.nextAction}</td>
                      <td className="px-2 py-1">
                        {item.blocksOperation ? 'yes' : 'no'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              No current operational readiness actions.
            </div>
          )}
        </div>
      </div>
    </CollapsibleStatusSection>
  )
}
