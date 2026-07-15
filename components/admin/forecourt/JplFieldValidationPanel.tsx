'use client'

import { useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'

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

export function JplFieldValidationPanel() {
  const [csrfToken, setCsrfToken] = useState('')
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [checkpointStatus, setCheckpointStatus] = useState('passed')
  const [note, setNote] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [confirmNoPssWrite, setConfirmNoPssWrite] = useState(false)
  const [confirmManualValidation, setConfirmManualValidation] = useState(false)
  const [evidenceImportJson, setEvidenceImportJson] = useState('')
  const [importingEvidence, setImportingEvidence] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>('/api/admin/forecourt/field-validation')
      if (!response.success) {
        throw new Error(
          response.error || 'Failed to load field validation readiness',
        )
      }
      setPayload(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load field validation readiness')
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

  const checklist = useMemo(
    () => (Array.isArray(payload?.checklist) ? payload.checklist : []),
    [payload?.checklist],
  )

  useEffect(() => {
    if (!selectedItemId && checklist[0]?.id) setSelectedItemId(checklist[0].id)
  }, [checklist, selectedItemId])

  const grouped = useMemo(() => {
    const groups = new Map<string, any[]>()
    for (const item of checklist) {
      const key = String(item?.area ?? 'other')
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return Array.from(groups.entries())
  }, [checklist])

  const canRecord = Boolean(
    csrfToken &&
    selectedItemId &&
    checkpointStatus &&
    (note.trim() || evidenceReference.trim()) &&
    confirmNoPssWrite &&
    confirmManualValidation &&
    !recording,
  )

  const canImportEvidence = Boolean(
    csrfToken &&
    evidenceImportJson.trim() &&
    confirmNoPssWrite &&
    confirmManualValidation &&
    !importingEvidence,
  )

  const recordCheckpoint = async () => {
    setRecording(true)
    setError('')
    setMessage('')
    try {
      const response = await api<any>('/api/admin/forecourt/field-validation', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: JSON.stringify({
          checklistItemId: selectedItemId,
          status: checkpointStatus,
          note,
          evidenceReference,
          confirmNoPssWrite,
          confirmManualValidation,
          csrf_token: csrfToken,
        }),
      })

      if (!response.success) {
        throw new Error(
          response.error || 'Failed to record validation checkpoint',
        )
      }

      setMessage(
        `Validation checkpoint recorded. Audit log: ${response.data?.auditLogId ?? 'created'}.`,
      )
      setNote('')
      setEvidenceReference('')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Failed to record validation checkpoint')
    } finally {
      setRecording(false)
    }
  }

  const importEvidence = async () => {
    setImportingEvidence(true)
    setError('')
    setMessage('')
    try {
      let parsed: any
      try {
        parsed = JSON.parse(evidenceImportJson)
      } catch {
        throw new Error('Evidence import must be valid JSON')
      }

      const response = await api<any>('/api/admin/forecourt/field-validation', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: JSON.stringify({
          action: 'import-evidence',
          ...parsed,
          confirmNoPssWrite,
          confirmManualValidation,
          csrf_token: csrfToken,
        }),
      })

      if (!response.success) {
        throw new Error(
          response.error || 'Failed to import validation evidence',
        )
      }

      setMessage(
        `Validation evidence imported. ${response.data?.checkpointCount ?? 0} checkpoint(s) recorded.`,
      )
      setEvidenceImportJson('')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Failed to import validation evidence')
    } finally {
      setImportingEvidence(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              DOMS field validation readiness
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Tracks what is implemented versus what still needs local build,
              simulator, real controller, and Tanzania endpoint validation
              before production rollout.
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
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh readiness'}
            </Button>
            <Button type="button" variant="secondary" asChild>
              <a
                href="/api/admin/forecourt/field-validation/export"
                target="_blank"
                rel="noreferrer"
              >
                Export JSON
              </a>
            </Button>
          </div>
        </div>

        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
          This panel is audit-support only. Recording a checkpoint sends no
          DOMS/PSS command, updates no mappings, and does not approve Tanzania
          cutover.
        </div>

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

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Release gate</div>
              <p className="text-sm text-[var(--text-secondary)]">
                Uses the latest recorded checkpoints to decide whether DOMS
                rollout evidence is complete enough for final human review.
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
                payload?.releaseGate?.pssWriteExecutionStillDisabled ?? true,
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

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {grouped.map(([area, items]) => (
            <div
              key={area}
              className="rounded border bg-[var(--surface-card)] p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {area}
                </div>
                <Badge variant={STATUS_VARIANT.INFO}>
                  {items.length} checks
                </Badge>
              </div>
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
                  </div>
                ))}
              </div>
            </div>
          ))}
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

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 text-sm font-semibold">
            Record validation checkpoint
          </div>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Record manual evidence after local builds, simulator tests, real
            controller tests, or Tanzania endpoint validation. This only writes
            audit/event records.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              value={selectedItemId}
              onChange={(event) => setSelectedItemId(event.target.value)}
            >
              {checklist.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
            <Select
              value={checkpointStatus}
              onChange={(event) => setCheckpointStatus(event.target.value)}
            >
              <option value="passed">passed</option>
              <option value="pending">pending</option>
              <option value="warning">warning</option>
              <option value="blocked">blocked</option>
            </Select>
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Validation note, for example: npm run build passed on Ben's local dev environment."
            className="mt-3 min-h-24 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
          />
          <input
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.target.value)}
            placeholder="Optional evidence reference, ticket, screenshot name, log bundle, or controller ID"
            className="mt-3 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
          />
          <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmNoPssWrite}
                onChange={(event) => setConfirmNoPssWrite(event.target.checked)}
                className="mt-1"
              />
              <span>I confirm this checkpoint sends no DOMS/PSS command.</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmManualValidation}
                onChange={(event) =>
                  setConfirmManualValidation(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                I confirm this is manual validation evidence and not an
                execution approval.
              </span>
            </label>
          </div>
          <div className="mt-3">
            <Button
              type="button"
              onClick={recordCheckpoint}
              disabled={!canRecord}
            >
              {recording ? 'Recording...' : 'Record checkpoint'}
            </Button>
          </div>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 text-sm font-semibold">
            Import validation evidence JSON
          </div>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Paste a local build/test, simulator, live-controller, Tanzania
            endpoint, cloud-cutover, or explicit checkpoint evidence object.
            Secrets are redacted before audit persistence.
          </p>
          <textarea
            value={evidenceImportJson}
            onChange={(event) => setEvidenceImportJson(event.target.value)}
            placeholder={
              '{\n  "evidenceType": "build-test-run",\n  "evidenceReference": "local-terminal-2026-07-09",\n  "results": { "buildPassed": true, "testsPassed": true }\n}'
            }
            className="min-h-40 w-full rounded border bg-[var(--surface-card)] p-2 font-mono text-xs text-[var(--text-primary)]"
          />
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={importEvidence}
              disabled={!canImportEvidence}
            >
              {importingEvidence ? 'Importing...' : 'Import evidence'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
