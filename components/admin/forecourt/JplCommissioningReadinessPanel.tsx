'use client'

import { useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const valueOrDash = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const statusVariant = (status: unknown) => {
  switch (String(status ?? '').toLowerCase()) {
    case 'ready':
    case 'pass':
      return STATUS_VARIANT.SUCCESS
    case 'blocked':
    case 'block':
      return STATUS_VARIANT.ERROR
    case 'ready-with-warnings':
    case 'warn':
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.INFO
  }
}

function StepList({ title, steps }: { title: string; steps: any[] }) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className="rounded border bg-[var(--surface-base)] p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {step.title}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  {step.phase} • {step.owner}
                </div>
              </div>
              {step.required ? (
                <Badge variant={STATUS_VARIANT.NEUTRAL}>required</Badge>
              ) : (
                <Badge variant={STATUS_VARIANT.INFO}>optional</Badge>
              )}
            </div>
            <div className="mt-2 text-sm text-[var(--text-secondary)]">
              {step.description}
            </div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Evidence: {step.evidenceRequired}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function JplCommissioningReadinessPanel() {
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>('/api/admin/forecourt/commissioning')
      if (!response.success) {
        throw new Error(
          response.error || 'Failed to load commissioning readiness',
        )
      }
      setPayload(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load commissioning readiness')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const checks = useMemo(
    () =>
      Array.isArray(payload?.settingsValidation?.checks)
        ? payload.settingsValidation.checks
        : [],
    [payload?.settingsValidation?.checks],
  )

  const blockers = payload?.settingsValidation?.blockers?.length ?? 0
  const warnings = payload?.settingsValidation?.warnings?.length ?? 0

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              DOMS commissioning readiness
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Validates live JPL settings and shows first-site commissioning and
              legacy/simulator-to-JPL cutover steps. This panel is read-only and
              sends no DOMS/PSS command.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(payload?.status)}>
              {valueOrDash(payload?.status)}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh commissioning'}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Setting blockers
            </div>
            <div className="mt-1 text-xl font-semibold">{blockers}</div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Setting warnings
            </div>
            <div className="mt-1 text-xl font-semibold">{warnings}</div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Live JPL observed
            </div>
            <div className="mt-1 text-xl font-semibold">
              {payload?.liveReadiness?.connected ? 'yes' : 'no'}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Reconciliation
            </div>
            <div className="mt-1 text-xl font-semibold">
              {valueOrDash(payload?.liveReadiness?.reconciliationSeverity)}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Validation blockers
            </div>
            <div className="mt-1 text-xl font-semibold">
              {payload?.liveReadiness?.blockingValidationItems ?? '—'}
            </div>
          </div>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              Live connection setting checks
            </div>
            <Badge variant={statusVariant(payload?.settingsValidation?.status)}>
              {valueOrDash(payload?.settingsValidation?.status)}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {checks.map((check: any) => (
              <div
                key={check.id}
                className="rounded border bg-[var(--surface-base)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {check.title}
                  </div>
                  <Badge variant={statusVariant(check.severity)}>
                    {check.severity}
                  </Badge>
                </div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                  {check.detail}
                </div>
                {check.nextAction ? (
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Next: {check.nextAction}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <StepList
            title="First-site commissioning checklist"
            steps={payload?.commissioningChecklist ?? []}
          />
          <StepList
            title="Legacy/simulator to JPL-only runbook"
            steps={payload?.legacyToJplRunbook ?? []}
          />
        </div>
      </CardContent>
    </Card>
  )
}
