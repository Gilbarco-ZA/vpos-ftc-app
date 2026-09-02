'use client'

import type { ToastMessage } from '@/components/ui/toast'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
import { DeferredForecourtPanel } from '@/components/admin/forecourt/DeferredForecourtPanel'
import { JplOperationalReadinessPanel } from '@/components/admin/forecourt/JplOperationalReadinessPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

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

const formatTimestamp = (value: unknown) => {
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

const actionForCheck = (check: any) => {
  const id = String(check?.id ?? '')
  if (id.startsWith('jpl-') || id.startsWith('buffer-threshold-')) {
    return {
      href: '/admin/setup?step=forecourt',
      label: 'Update POS / JPL settings',
    }
  }
  return null
}

const actionForStep = (stepId: unknown, isTanzania: boolean) => {
  const id = String(stepId ?? '')
  if (
    !isTanzania &&
    ['commissioning-fiscal-route', 'commissioning-ewura'].includes(id)
  ) {
    return null
  }
  const actions: Record<string, { href: string; label: string }> = {
    'commissioning-registration': {
      href: '/dashboard',
      label: 'Open registration',
    },
    'commissioning-pss-configurator': {
      href: '/setup/forecourt',
      label: 'Open forecourt setup',
    },
    'commissioning-live-settings': {
      href: '/admin/setup?step=forecourt',
      label: 'Update JPL settings',
    },
    'commissioning-connectivity-test': {
      href: '/admin/setup?step=forecourt',
      label: 'Open JPL connection settings',
    },
    'commissioning-products-grades': {
      href: '/admin/products',
      label: 'Review products',
    },
    'commissioning-pump-mappings': {
      href: '/settings/pumps',
      label: 'Review pump mappings',
    },
    'commissioning-nozzle-mappings': {
      href: '/settings/pumps',
      label: 'Review nozzle mappings',
    },
    'commissioning-tank-gauges': {
      href: '/tanks',
      label: 'Refresh tank data',
    },
    'commissioning-price-equipment': {
      href: '/setup/forecourt/pricing',
      label: 'Review pricing',
    },
    'commissioning-receipt-printer': {
      href: '/admin/config/printers',
      label: 'Configure printers',
    },
    'commissioning-fiscal-route': {
      href: '/admin/tanzania-fiscal',
      label: 'Open fiscal configuration',
    },
    'commissioning-ewura': {
      href: '/admin/tanzania-fiscal',
      label: 'Review EWURA registration',
    },
    'commissioning-first-sale': {
      href: '/transactions?status=non-fiscalized',
      label: 'Review transactions',
    },
    'commissioning-shift-close': {
      href: '/reports',
      label: 'Open reports',
    },
  }
  return actions[id] ?? null
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

function CommissioningChecklist({
  steps,
  summary,
  notesByStep,
  savingStepId,
  onNotesChange,
  onSave,
  isTanzania,
}: {
  steps: any[]
  summary: any
  notesByStep: Record<string, string>
  savingStepId: string
  onNotesChange: (stepId: string, notes: string) => void
  onSave: (step: any, completed: boolean) => Promise<void>
  isTanzania: boolean
}) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            First-site commissioning checklist
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            Site technicians can verify each field check and record supporting
            notes. Progress is stored per station and audited.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={STATUS_VARIANT.INFO}>
            {summary?.completed ?? 0}/{summary?.total ?? steps.length} complete
          </Badge>
          <Badge
            variant={
              summary?.requiredPercentComplete === 100
                ? STATUS_VARIANT.SUCCESS
                : STATUS_VARIANT.NEUTRAL
            }
          >
            Required {summary?.requiredPercentComplete ?? 0}%
          </Badge>
        </div>
      </div>

      <div className="mb-3 h-2 overflow-hidden rounded bg-[var(--surface-muted)]">
        <div
          className="h-full bg-[var(--accent)] transition-all"
          style={{ width: `${summary?.percentComplete ?? 0}%` }}
        />
      </div>

      <div className="space-y-3">
        {steps.map((step) => {
          const busy = savingStepId === step.id
          const notes = notesByStep[step.id] ?? step.notes ?? ''
          const action = actionForStep(step.id, isTanzania)
          return (
            <div
              key={step.id}
              className={`rounded border p-3 ${
                step.completed
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'bg-[var(--surface-base)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={step.completed === true}
                    disabled={busy}
                    onChange={(event) =>
                      void onSave(step, event.target.checked)
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      {step.phase} • {step.owner} •{' '}
                      {step.required ? 'required' : 'optional'}
                    </span>
                  </span>
                </label>
                <Badge
                  variant={
                    step.completed
                      ? STATUS_VARIANT.SUCCESS
                      : STATUS_VARIANT.INFO
                  }
                >
                  {step.completed ? 'verified' : 'open'}
                </Badge>
              </div>

              <div className="mt-2 text-sm text-[var(--text-secondary)]">
                {step.description}
              </div>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Evidence required: {step.evidenceRequired}
              </div>

              {action ? (
                <Button asChild size="sm" variant="ghost" className="mt-2">
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ) : null}

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <textarea
                  value={notes}
                  disabled={busy}
                  onChange={(event) =>
                    onNotesChange(step.id, event.target.value)
                  }
                  placeholder="Technician notes, evidence reference, ticket number, or observed result"
                  className="min-h-16 rounded border bg-[var(--surface-card)] p-2 text-xs text-[var(--text-primary)]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onSave(step, step.completed === true)}
                >
                  {busy ? 'Saving…' : 'Save notes'}
                </Button>
              </div>

              {step.completedAt ? (
                <div className="mt-2 text-xs text-[var(--text-muted)]">
                  Verified by {step.completedByUsername ?? 'site technician'} on{' '}
                  {formatTimestamp(step.completedAt)}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function JplCommissioningReadinessPanel({
  isTanzania,
}: {
  isTanzania: boolean
}) {
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [savingStepId, setSavingStepId] = useState('')
  const [notesByStep, setNotesByStep] = useState<Record<string, string>>({})
  const [testingConnection, setTestingConnection] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = (variant: ToastMessage['variant'], message: string) => {
    setToast({ id: `${Date.now()}`, variant, message })
  }

  const load = useCallback(async () => {
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
      const notes = Object.fromEntries(
        (response.data?.commissioningChecklist ?? []).map((step: any) => [
          step.id,
          String(step.notes ?? ''),
        ]),
      )
      setNotesByStep(notes)
    } catch (err: any) {
      setError(err?.message || 'Failed to load commissioning readiness')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
    fetch('/api/security/csrf', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data?.token === 'string') setCsrfToken(data.token)
      })
      .catch(() => setCsrfToken(''))
  }, [load])

  const saveChecklistStep = async (step: any, completed: boolean) => {
    setSavingStepId(step.id)
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/commissioning/checklist',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            stepId: step.id,
            completed,
            notes: notesByStep[step.id] ?? step.notes ?? '',
            csrf_token: csrfToken,
          }),
        },
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to update checklist')
      }
      setPayload(response.data ?? payload)
      const notes = Object.fromEntries(
        (response.data?.commissioningChecklist ?? []).map((item: any) => [
          item.id,
          String(item.notes ?? ''),
        ]),
      )
      setNotesByStep(notes)
      showToast(
        'success',
        completed
          ? `${step.title} marked as verified.`
          : `${step.title} returned to open.`,
      )
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update checklist')
    } finally {
      setSavingStepId('')
    }
  }

  const testConfiguredConnection = async () => {
    if (testingConnection) return
    setTestingConnection(true)
    try {
      const response = await api<any>(
        '/api/admin/forecourt/commissioning/test-connection',
        { method: 'POST', body: JSON.stringify({}) },
      )
      if (!response.success) {
        throw new Error(response.error || 'JPL connection test failed')
      }

      const result = response.data ?? {}
      const validationResponse = await api<any>(
        '/api/admin/forecourt/field-validation',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            action: 'record-command-result',
            checklistItemId: 'jpl-live-connection-observed',
            commandId: 'configured-jpl-connection-test',
            commandTitle: 'Configured JPL connection test',
            success: true,
            evidence: {
              connected: result.connected === true,
              loggedOn: result.loggedOn === true,
              statusUpdateOk: result.statusUpdateOk === true,
              fpStatusOk: result.fpStatusOk === true,
              host: result.host,
              port: result.port,
              jplVersion: result.jplVersion,
              heartbeatIdleMs: result.heartbeatIdleMs,
              inboundSilenceMs: result.inboundSilenceMs,
            },
          }),
        },
      )
      if (!validationResponse.success) {
        throw new Error(
          validationResponse.error ||
            'JPL connection succeeded, but readiness evidence could not be recorded',
        )
      }

      showToast(
        result.warning ? 'info' : 'success',
        result.warning
          ? `JPL logon succeeded with a warning: ${result.warning}`
          : `JPL connection verified at ${result.host}:${result.port}.`,
      )
      await load()
    } catch (err: any) {
      showToast('error', err?.message || 'JPL connection test failed')
    } finally {
      setTestingConnection(false)
    }
  }

  const checks = Array.isArray(payload?.settingsValidation?.checks)
    ? payload.settingsValidation.checks
    : []

  const blockers = payload?.settingsValidation?.blockers?.length ?? 0
  const warnings = payload?.settingsValidation?.warnings?.length ?? 0

  return (
    <>
      {toast ? (
        <ToastViewport>
          <ToastItem variant={toast.variant} onDismiss={() => setToast(null)}>
            {toast.message}
          </ToastItem>
        </ToastViewport>
      ) : null}
      <CollapsibleStatusSection
        title="DOMS commissioning readiness"
        status={valueOrDash(payload?.status)}
        statusVariant={statusVariant(payload?.status)}
        contentClassName="p-4 pt-0"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold">
                DOMS commissioning readiness
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Validate live JPL settings, complete the first-site technician
                checklist, and review the legacy/simulator-to-JPL cutover steps.
                Checklist edits are local only; the connection test sends
                read-only logon, status-update, and FpStatus requests.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(payload?.status)}>
                {valueOrDash(payload?.status)}
              </Badge>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void testConfiguredConnection()}
                disabled={testingConnection || loading || !csrfToken}
                className="gap-2"
              >
                {testingConnection ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {testingConnection
                  ? 'Testing connection…'
                  : 'Test JPL connection'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={load}
                disabled={loading || testingConnection}
              >
                {loading ? 'Refreshing...' : 'Refresh commissioning'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded border bg-[var(--surface-muted)] p-3">
            <Button asChild size="sm" variant="secondary">
              <Link href="/dashboard">Registration</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/setup?step=forecourt">POS / JPL settings</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/setup/forecourt">Forecourt setup</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/settings/pumps">Pump mappings</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/settings/tanks">Tank mappings</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/setup/forecourt/pricing">Fuel pricing</Link>
            </Button>
            {isTanzania ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/admin/tanzania-fiscal">Tanzania fiscal</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/config/printers">Receipt printers</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/transactions?status=non-fiscalized">
                Non-fiscalized transactions
              </Link>
            </Button>
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

          <CollapsibleStatusSection
            title="Live connection setting checks"
            status={valueOrDash(payload?.settingsValidation?.status)}
            statusVariant={statusVariant(payload?.settingsValidation?.status)}
          >
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  Live connection setting checks
                </div>
                <Badge
                  variant={statusVariant(payload?.settingsValidation?.status)}
                >
                  {valueOrDash(payload?.settingsValidation?.status)}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {checks.map((check: any) => {
                  const action = actionForCheck(check)
                  return (
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
                      {action ? (
                        <Button
                          asChild
                          size="sm"
                          variant="secondary"
                          className="mt-3"
                        >
                          <Link href={action.href}>{action.label}</Link>
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </CollapsibleStatusSection>

          <CollapsibleStatusSection
            title="First-site commissioning checklist"
            status={`${payload?.commissioningChecklistSummary?.completed ?? 0}/${
              payload?.commissioningChecklistSummary?.total ??
              payload?.commissioningChecklist?.length ??
              0
            } complete`}
            statusVariant={
              payload?.commissioningChecklistSummary
                ?.requiredPercentComplete === 100
                ? STATUS_VARIANT.SUCCESS
                : STATUS_VARIANT.NEUTRAL
            }
          >
            <CommissioningChecklist
              steps={payload?.commissioningChecklist ?? []}
              summary={payload?.commissioningChecklistSummary ?? {}}
              notesByStep={notesByStep}
              savingStepId={savingStepId}
              onNotesChange={(stepId, notes) =>
                setNotesByStep((current) => ({ ...current, [stepId]: notes }))
              }
              onSave={saveChecklistStep}
              isTanzania={isTanzania}
            />
          </CollapsibleStatusSection>

          <CollapsibleStatusSection
            title="Legacy/simulator to JPL-only runbook"
            status={`${payload?.legacyToJplRunbook?.length ?? 0} steps`}
            statusVariant={STATUS_VARIANT.INFO}
          >
            <StepList
              title="Legacy/simulator to JPL-only runbook"
              steps={payload?.legacyToJplRunbook ?? []}
            />
          </CollapsibleStatusSection>

          <DeferredForecourtPanel label="Operational readiness">
            <JplOperationalReadinessPanel />
          </DeferredForecourtPanel>
        </div>
      </CollapsibleStatusSection>
    </>
  )
}
