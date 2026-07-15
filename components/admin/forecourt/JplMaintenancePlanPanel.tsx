'use client'

import { useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const ts =
    typeof value === 'number' ? value : new Date(String(value)).getTime()
  if (!Number.isFinite(ts)) return String(value)
  return new Date(ts).toLocaleString()
}

const valueOrDash = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const variantForSeverity = (value: unknown) => {
  const severity = String(value ?? '').toLowerCase()
  if (severity === 'error') return STATUS_VARIANT.ERROR
  if (severity === 'warning') return STATUS_VARIANT.NEUTRAL
  if (severity === 'ok') return STATUS_VARIANT.SUCCESS
  return STATUS_VARIANT.INFO
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
        {valueOrDash(value)}
      </div>
    </div>
  )
}

export function JplMaintenancePlanPanel() {
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [confirmDryRunOnly, setConfirmDryRunOnly] = useState(false)
  const [confirmationNote, setConfirmationNote] = useState('')
  const [recordingReview, setRecordingReview] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>('/api/admin/forecourt/maintenance/plan')
      if (!response.success) {
        throw new Error(response.error || 'Failed to load maintenance plan')
      }
      setPlan(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load maintenance plan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    fetch('/api/security/csrf', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data?.token === 'string') setCsrfToken(data.token)
      })
      .catch(() => setCsrfToken(''))
  }, [])

  const steps = plan?.steps ?? []
  const topSteps = useMemo(() => steps.slice(0, 18), [steps])
  const pssWriteCandidates = plan?.pssWriteCandidates ?? []

  const recordReview = async () => {
    setRecordingReview(true)
    setMessage('')
    setError('')
    try {
      const response = await api<any>('/api/admin/forecourt/maintenance/plan', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: JSON.stringify({
          confirmDryRunOnly,
          confirmationNote,
          csrf_token: csrfToken,
        }),
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to record maintenance review')
      }

      setPlan(response.data?.plan ?? plan)
      setMessage(
        `Maintenance plan review recorded. Audit log: ${response.data?.auditLogId ?? 'created'}.`,
      )
    } catch (err: any) {
      setError(err?.message || 'Failed to record maintenance review')
    } finally {
      setRecordingReview(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">DOMS maintenance plan</div>
            <p className="text-sm text-[var(--text-secondary)]">
              Dry-run maintenance planning for future PSS write work. This panel
              does not send DOMS install or clear-install commands.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={variantForSeverity(plan?.readiness?.severity)}>
              {String(plan?.readiness?.severity ?? 'unknown').toUpperCase()}
            </Badge>
            <Badge variant={STATUS_VARIANT.INFO}>
              {plan?.mode ?? 'dry-run'}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh plan'}
            </Button>
          </div>
        </div>

        {plan?.safetyBoundary ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
            {plan.safetyBoundary}
          </div>
        ) : null}

        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Generated" value={fmtTs(plan?.generatedAt)} />
          <Metric
            label="Reconciliation issues"
            value={plan?.readiness?.issueCount}
          />
          <Metric
            label="FTC suggestions"
            value={plan?.readiness?.suggestionCount}
          />
          <Metric
            label="PSS candidates"
            value={plan?.readiness?.pssWriteCandidateCount}
          />
          <Metric
            label="Blocking issues"
            value={plan?.readiness?.unresolvedBlockingIssueCount}
          />
          <Metric
            label="Fresh install status"
            value={plan?.readiness?.hasFreshInstallStatus ? 'yes' : 'no'}
          />
          <Metric label="Steps" value={steps.length} />
          <Metric
            label="Maintenance mode"
            value={plan?.maintenanceMode?.enabled ? 'enabled' : 'disabled'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 text-sm font-semibold">Dry-run plan steps</div>
            {topSteps.length ? (
              <div className="space-y-2">
                {topSteps.map((step: any) => (
                  <div key={step.id} className="rounded border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={variantForSeverity(step.severity)}>
                        {step.severity}
                      </Badge>
                      <Badge variant={STATUS_VARIANT.NEUTRAL}>
                        {step.category}
                      </Badge>
                      <span className="font-medium">{step.title}</span>
                    </div>
                    <div className="mt-2 text-[var(--text-secondary)]">
                      {step.description}
                    </div>
                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                      {step.suggestedAction}
                    </div>
                    {step.plannedJplCommandName ? (
                      <div className="mt-2 rounded bg-[var(--surface-muted)] p-2 text-xs">
                        Planned command reference: {step.plannedJplCommandName}
                        {step.plannedJplSubCode
                          ? ` / ${step.plannedJplSubCode}`
                          : ''}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs text-amber-700">
                      {step.safetyNote}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No plan steps generated.
              </div>
            )}
          </div>

          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 text-sm font-semibold">
              Possible PSS maintenance candidates
            </div>
            {pssWriteCandidates.length ? (
              <div className="space-y-2">
                {pssWriteCandidates.slice(0, 10).map((step: any) => (
                  <div
                    key={step.id}
                    className="rounded border border-amber-500/20 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT.NEUTRAL}>
                        manual review
                      </Badge>
                      <span className="font-medium">{step.title}</span>
                    </div>
                    <div className="mt-2 text-[var(--text-secondary)]">
                      {step.description}
                    </div>
                    <div className="mt-2 text-xs text-amber-700">
                      {step.safetyNote}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No possible PSS write candidates were detected. Continue with
                FTC-side mapping verification and snapshot refresh.
              </div>
            )}
          </div>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 text-sm font-semibold">
            Record maintenance plan review
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_auto]">
            <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={confirmDryRunOnly}
                onChange={(event) => setConfirmDryRunOnly(event.target.checked)}
                className="mt-1"
              />
              <span>
                I understand this records a dry-run review only and sends no
                DOMS/PSS command.
              </span>
            </label>
            <textarea
              value={confirmationNote}
              onChange={(event) => setConfirmationNote(event.target.value)}
              placeholder="Optional review note, for example: compared with PSS Configurator export before scheduling maintenance."
              className="min-h-16 rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
            />
            <Button
              type="button"
              disabled={!csrfToken || !confirmDryRunOnly || recordingReview}
              onClick={recordReview}
            >
              {recordingReview ? 'Recording...' : 'Record review'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
