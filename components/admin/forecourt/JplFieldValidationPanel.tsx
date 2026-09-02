'use client'

import type { ToastMessage } from '@/components/ui/toast'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
import { JplProductionControls } from '@/components/admin/forecourt/JplProductionControls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

const valueOrDash = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const statusVariant = (status: unknown) => {
  switch (String(status ?? '').toLowerCase()) {
    case 'passed':
    case 'ready-for-review':
    case 'ready-for-final-review':
      return STATUS_VARIANT.SUCCESS
    case 'blocked':
      return STATUS_VARIANT.ERROR
    case 'warning':
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.INFO
  }
}

const fmtJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

const responseErrorMessage = (body: any, fallback: string) =>
  String(
    body?.error?.message ||
      body?.message ||
      (typeof body?.error === 'string' ? body.error : '') ||
      fallback,
  )

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 break-words text-lg font-semibold text-[var(--text-primary)]">
        {valueOrDash(value)}
      </div>
    </div>
  )
}

const FULL_WIDTH_AREAS = new Set([
  'operations',
  'jpl-hardware',
  'maintenance-safety',
  'cloud-cutover',
])

const aggregateAreaStatus = (items: any[]) => {
  const statuses = items.map((item) => String(item?.status ?? '').toLowerCase())
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.length && statuses.every((status) => status === 'passed')) {
    return 'passed'
  }
  return 'pending'
}

export function JplFieldValidationPanel({
  isTanzania,
}: {
  isTanzania: boolean
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [activeAction, setActiveAction] = useState('')
  const [evidenceImportJson, setEvidenceImportJson] = useState('')
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = (variant: ToastMessage['variant'], message: string) => {
    setToast({ id: `${Date.now()}`, variant, message })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await api<any>('/api/admin/forecourt/field-validation')
      if (!response.success) {
        throw new Error(
          response.error || 'Failed to load field validation readiness',
        )
      }
      setPayload(response.data ?? null)
    } catch (error: any) {
      setLoadError(
        error?.message || 'Failed to load field validation readiness',
      )
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

  const grouped = (() => {
    const checklist = Array.isArray(payload?.checklist) ? payload.checklist : []
    const groups = new Map<string, any[]>()
    for (const item of checklist) {
      const key = String(item?.area ?? 'other')
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return Array.from(groups.entries()).filter(
      ([area]) => isTanzania || area !== 'tanzania-fiscalization',
    )
  })()

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify(body),
    })
    const responseBody = await response.json().catch(() => ({}))
    if (!response.ok || responseBody?.success === false) {
      throw new Error(
        responseErrorMessage(
          responseBody,
          `Request failed (${response.status})`,
        ),
      )
    }
    return responseBody?.data ?? responseBody
  }

  const recordCommandResult = async (input: {
    checklistItemId: string
    commandId: string
    commandTitle: string
    evidence?: Record<string, unknown>
  }) => {
    await postJson('/api/admin/forecourt/field-validation', {
      action: 'record-command-result',
      ...input,
      success: true,
    })
  }

  const testConfiguredConnection = async () => {
    if (activeAction) return
    setActiveAction('connection')
    try {
      const result = await postJson(
        '/api/admin/forecourt/commissioning/test-connection',
        {},
      )
      await recordCommandResult({
        checklistItemId: 'jpl-live-connection-observed',
        commandId: 'commissioning:test-configured-jpl-connection',
        commandTitle: 'Configured JPL connection test',
        evidence: {
          connected: true,
          host: result?.host ?? null,
          port: result?.port ?? null,
          heartbeatIdleMs: result?.heartbeatIdleMs ?? null,
          inboundSilenceMs: result?.inboundSilenceMs ?? null,
          statusUpdateOk: result?.statusUpdateOk === true,
          fpStatusOk: result?.fpStatusOk === true,
        },
      })
      await load()
      showToast(
        'success',
        'Configured JPL connection succeeded and the live-connection readiness check was marked passed.',
      )
    } catch (error: any) {
      showToast('error', error?.message || 'Configured JPL connection failed')
    } finally {
      setActiveAction('')
    }
  }

  const runLiveReadOnlyValidation = async () => {
    if (activeAction) return
    setActiveAction('live-readonly')
    try {
      const result = await postJson(
        '/api/admin/forecourt/field-validation/live-readonly',
        {
          useConfiguredTarget: true,
          profile: 'dispense-readonly',
          includeRejectProbe: false,
        },
      )
      const evidenceImport = result?.evidenceImport
      if (!evidenceImport || typeof evidenceImport !== 'object') {
        throw new Error('Live validation returned no importable evidence')
      }
      await postJson('/api/admin/forecourt/field-validation', {
        action: 'import-evidence',
        ...evidenceImport,
        confirmNoPssWrite: true,
        confirmManualValidation: true,
      })
      await load()
      showToast(
        'success',
        'Read-only JPL validation completed. Applicable FP-status and value-normalization checks were recorded automatically.',
      )
    } catch (error: any) {
      showToast('error', error?.message || 'Read-only JPL validation failed')
    } finally {
      setActiveAction('')
    }
  }

  const importEvidence = async () => {
    if (activeAction) return
    setActiveAction('import-evidence')
    try {
      let parsed: any
      try {
        parsed = JSON.parse(evidenceImportJson)
      } catch {
        throw new Error('Evidence import must be valid JSON')
      }

      const result = await postJson('/api/admin/forecourt/field-validation', {
        action: 'import-evidence',
        ...parsed,
        confirmNoPssWrite: true,
        confirmManualValidation: true,
      })

      setEvidenceImportJson('')
      await load()
      showToast(
        'success',
        `Validation evidence imported. ${result?.checkpointCount ?? 0} checkpoint(s) recorded.`,
      )
    } catch (error: any) {
      showToast(
        'error',
        error?.message || 'Failed to import validation evidence',
      )
    } finally {
      setActiveAction('')
    }
  }

  const renderItemControl = (item: any) => {
    if (item.id === 'jpl-live-connection-observed') {
      return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={testConfiguredConnection}
            disabled={Boolean(activeAction) || !csrfToken}
          >
            {activeAction === 'connection' ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Test configured JPL connection
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link href="/admin/setup?step=forecourt">
              Update POS / JPL settings
            </Link>
          </Button>
        </div>
      )
    }

    if (item.id === 'jpl-live-fp-status-conformance-validated') {
      return (
        <div className="mt-3 space-y-2">
          <Button
            type="button"
            variant="secondary"
            onClick={runLiveReadOnlyValidation}
            disabled={Boolean(activeAction) || !csrfToken}
          >
            {activeAction === 'live-readonly' ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Run read-only FP conformance test
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            This read-only profile also records the applicable live
            value-normalization check.
          </p>
        </div>
      )
    }

    if (item.id === 'production-workflows-exercised') {
      return (
        <div className="mt-4 border-t pt-4">
          <JplProductionControls
            embedded
            validationChecklistItemId="production-workflows-exercised"
            onValidationRecorded={load}
          />
        </div>
      )
    }

    return null
  }

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
        title="DOMS field validation readiness"
        status={valueOrDash(payload?.overallStatus)}
        statusVariant={statusVariant(payload?.overallStatus)}
        contentClassName="p-4 pt-0"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold">
                DOMS field validation readiness
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Tracks simulator, live-controller, production-workflow,
                reconciliation, maintenance-safety, Tanzania, and cutover
                evidence. Build and package checks are enforced before
                deployment and are not duplicated here.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(payload?.overallStatus)}>
                {valueOrDash(payload?.overallStatus)}
              </Badge>
              <Badge variant={statusVariant(payload?.productionReleaseStatus)}>
                {valueOrDash(payload?.productionReleaseStatus)}
              </Badge>
              <Button
                type="button"
                variant="secondary"
                onClick={load}
                disabled={loading || Boolean(activeAction)}
              >
                {loading ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Refresh readiness
              </Button>
              <Button type="button" variant="secondary" asChild>
                <Link
                  href="/api/admin/forecourt/field-validation/export"
                  prefetch={false}
                  target="_blank"
                  rel="noreferrer"
                >
                  Export JSON
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
            Controls are embedded under the readiness check they validate. A
            successful command records audit evidence automatically; failed
            command results are displayed as toasts and do not change readiness.
          </div>

          {loadError ? (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Metric label="Total" value={payload?.summary?.totalItems} />
            <Metric label="Passed" value={payload?.summary?.passed} />
            <Metric label="Pending" value={payload?.summary?.pending} />
            <Metric label="Warnings" value={payload?.summary?.warning} />
            <Metric label="Blocked" value={payload?.summary?.blocked} />
            <Metric
              label="Production blockers"
              value={payload?.summary?.blockingItemCount}
            />
          </div>

          <CollapsibleStatusSection
            title="Release gate"
            status={valueOrDash(payload?.releaseGate?.status)}
            statusVariant={statusVariant(payload?.releaseGate?.status)}
            contentClassName="p-3 pt-0"
          >
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Release gate</div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Uses recorded field evidence to determine whether DOMS
                    rollout is ready for final human review.
                  </p>
                </div>
                <Badge variant={statusVariant(payload?.releaseGate?.status)}>
                  {valueOrDash(payload?.releaseGate?.status)}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Metric
                  label="Gate blockers"
                  value={payload?.releaseGate?.blockerCount}
                />
                <Metric
                  label="Recorded evidence"
                  value={payload?.releaseGate?.checkpointCount}
                />
                <Metric
                  label="Latest evidence"
                  value={payload?.releaseGate?.latestCheckpointAt}
                />
                <Metric
                  label="PSS writes disabled"
                  value={String(
                    payload?.releaseGate?.pssWriteExecutionStillDisabled ??
                      true,
                  )}
                />
              </div>
              {Array.isArray(payload?.releaseGate?.unsatisfiedRequirementIds) &&
              payload.releaseGate.unsatisfiedRequirementIds.length ? (
                <div className="mt-3 text-xs text-[var(--text-muted)]">
                  Outstanding:{' '}
                  {payload.releaseGate.unsatisfiedRequirementIds.join(', ')}
                </div>
              ) : null}
            </div>
          </CollapsibleStatusSection>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {grouped.map(([area, items]) => {
              const areaStatus = aggregateAreaStatus(items)
              return (
                <CollapsibleStatusSection
                  key={area}
                  title={area}
                  status={areaStatus}
                  statusVariant={statusVariant(areaStatus)}
                  className={FULL_WIDTH_AREAS.has(area) ? 'xl:col-span-2' : ''}
                >
                  <div className="space-y-3">
                    {items.map((item: any) => (
                      <div
                        key={item.id}
                        className="rounded border bg-[var(--surface-base)] p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {item.title}
                            </div>
                            <div className="mt-1 text-sm text-[var(--text-secondary)]">
                              {item.description}
                            </div>
                          </div>
                          <Badge variant={statusVariant(item.status)}>
                            {item.status}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-[var(--text-muted)]">
                          Next: {item.nextAction}
                        </div>
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-muted)] p-2 text-xs text-[var(--text-secondary)]">
                          {fmtJson(item.evidence)}
                        </pre>
                        {renderItemControl(item)}
                      </div>
                    ))}
                  </div>
                </CollapsibleStatusSection>
              )
            })}
          </div>

          {Array.isArray(payload?.recentCheckpoints) &&
          payload.recentCheckpoints.length ? (
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">Recent evidence</div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-1">Recorded</th>
                      <th className="px-2 py-1">Checklist item</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.recentCheckpoints
                      .slice(0, 10)
                      .map((checkpoint: any) => (
                        <tr key={checkpoint.id} className="border-t">
                          <td className="px-2 py-1 text-xs text-[var(--text-muted)]">
                            {valueOrDash(checkpoint.recordedAt)}
                          </td>
                          <td className="px-2 py-1">
                            {valueOrDash(checkpoint.checklistItemId)}
                          </td>
                          <td className="px-2 py-1">
                            <Badge variant={statusVariant(checkpoint.status)}>
                              {valueOrDash(checkpoint.status)}
                            </Badge>
                          </td>
                          <td className="px-2 py-1">
                            {valueOrDash(checkpoint.evidenceReference)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <CollapsibleStatusSection
            title="Import external field evidence JSON"
            status={activeAction === 'import-evidence' ? 'importing' : 'ready'}
            statusVariant={
              activeAction === 'import-evidence'
                ? STATUS_VARIANT.INFO
                : STATUS_VARIANT.SUCCESS
            }
            contentClassName="p-3 pt-0"
          >
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Import external field evidence JSON
              </div>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">
                Use this only for simulator, live-controller, Tanzania endpoint,
                or cutover evidence produced outside this page. Build/package
                results are intentionally excluded from field readiness.
              </p>
              <textarea
                value={evidenceImportJson}
                onChange={(event) => setEvidenceImportJson(event.target.value)}
                placeholder={
                  '{\n  "evidenceType": "jpl-session-resilience",\n  "evidenceReference": "site-test-log-2026-07-16",\n  "results": { "reconnected": true, "heartbeatPassed": true }\n}'
                }
                className="min-h-40 w-full rounded border bg-[var(--surface-card)] p-2 font-mono text-xs text-[var(--text-primary)]"
              />
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={importEvidence}
                  disabled={
                    !csrfToken ||
                    !evidenceImportJson.trim() ||
                    Boolean(activeAction)
                  }
                >
                  {activeAction === 'import-evidence' ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  Import evidence
                </Button>
              </div>
            </div>
          </CollapsibleStatusSection>
        </div>
      </CollapsibleStatusSection>
    </>
  )
}
