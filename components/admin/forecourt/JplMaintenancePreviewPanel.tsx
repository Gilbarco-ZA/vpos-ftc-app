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

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleString()
}

const statusVariant = (value: unknown) => {
  const text = String(value ?? '').toLowerCase()
  if (text === 'validated' || text === 'approved') return STATUS_VARIANT.SUCCESS
  if (text === 'blocked' || text === 'high') return STATUS_VARIANT.ERROR
  if (text === 'read-only') return STATUS_VARIANT.INFO
  return STATUS_VARIANT.NEUTRAL
}

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

export function JplMaintenancePreviewPanel() {
  const [csrfToken, setCsrfToken] = useState('')
  const [sessionsPayload, setSessionsPayload] = useState<any>(null)
  const [previewPayload, setPreviewPayload] = useState<any>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [confirmApproved, setConfirmApproved] = useState(false)
  const [confirmPreviewOnly, setConfirmPreviewOnly] = useState(false)
  const [confirmNoCommand, setConfirmNoCommand] = useState(false)
  const [includeSnapshotReads, setIncludeSnapshotReads] = useState(true)
  const [includeClearInstallPreviews, setIncludeClearInstallPreviews] =
    useState(true)
  const [includeInstallFpPreviews, setIncludeInstallFpPreviews] = useState(true)
  const [note, setNote] = useState('')

  const activeSession = sessionsPayload?.activeSession ?? null
  const previews = previewPayload?.previews ?? []

  const loadSessions = async () => {
    setLoadingSessions(true)
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/maintenance/sessions',
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to load maintenance sessions')
      }
      setSessionsPayload(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load maintenance sessions')
    } finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => {
    void loadSessions()
    fetch('/api/security/csrf', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data?.token === 'string') setCsrfToken(data.token)
      })
      .catch(() => setCsrfToken(''))
  }, [])

  const canGenerate = useMemo(
    () =>
      Boolean(
        csrfToken &&
        activeSession?.id &&
        confirmApproved &&
        confirmPreviewOnly &&
        confirmNoCommand &&
        !generating,
      ),
    [
      activeSession?.id,
      confirmApproved,
      confirmNoCommand,
      confirmPreviewOnly,
      csrfToken,
      generating,
    ],
  )

  const generatePreview = async () => {
    if (!activeSession?.id) return
    setGenerating(true)
    setError('')
    setMessage('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/maintenance/preview',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            sessionId: activeSession.id,
            note,
            confirmApprovedMaintenanceSession: confirmApproved,
            confirmPreviewOnly,
            confirmNoDomsCommand: confirmNoCommand,
            includeSnapshotReads,
            includeClearInstallPreviews,
            includeInstallFpPreviews,
            csrf_token: csrfToken,
          }),
        },
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate command preview')
      }

      setPreviewPayload(response.data ?? null)
      setMessage(
        `Preview generated. Audit log: ${response.data?.auditLogId ?? 'created'}.`,
      )
    } catch (err: any) {
      setError(err?.message || 'Failed to generate command preview')
    } finally {
      setGenerating(false)
    }
  }

  const exportPreview = () => {
    if (!previewPayload) return
    const blob = new Blob([JSON.stringify(previewPayload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `doms-maintenance-command-preview-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              DOMS maintenance command previews
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Build and validate future maintenance command envelopes behind an
              approved maintenance session. This panel does not send any
              DOMS/PSS command.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                activeSession ? STATUS_VARIANT.SUCCESS : STATUS_VARIANT.NEUTRAL
              }
            >
              {activeSession ? 'approved session' : 'no approved session'}
            </Badge>
            <Badge variant={STATUS_VARIANT.NEUTRAL}>execution disabled</Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={loadSessions}
              disabled={loadingSessions}
            >
              {loadingSessions ? 'Refreshing...' : 'Refresh sessions'}
            </Button>
          </div>
        </div>

        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
          Preview envelopes are planning artifacts only. They are not executable
          in this pass and must be compared against PSS Configurator, physical
          wiring, and site procedures before any future implementation enables
          writes.
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Session" value={activeSession?.id} />
          <Metric
            label="Session expires"
            value={fmtTs(activeSession?.expiresAt)}
          />
          <Metric
            label="Generated previews"
            value={previewPayload?.summary?.total}
          />
          <Metric
            label="Validated previews"
            value={previewPayload?.summary?.validated}
          />
          <Metric
            label="Blocked previews"
            value={previewPayload?.summary?.blocked}
          />
          <Metric
            label="High-risk previews"
            value={previewPayload?.summary?.highRisk}
          />
          <Metric
            label="Read-only previews"
            value={previewPayload?.summary?.readOnly}
          />
          <Metric
            label="Sends command"
            value={previewPayload?.summary?.sendsDomsCommand ? 'yes' : 'no'}
          />
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 text-sm font-semibold">Preview options</div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-2 text-sm text-[var(--text-secondary)]">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={includeSnapshotReads}
                  onChange={(event) =>
                    setIncludeSnapshotReads(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>Include read-only snapshot commands.</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={includeClearInstallPreviews}
                  onChange={(event) =>
                    setIncludeClearInstallPreviews(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>
                  Include clear-install preview candidates for unmapped DOMS
                  devices.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={includeInstallFpPreviews}
                  onChange={(event) =>
                    setIncludeInstallFpPreviews(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>
                  Include install_Fp preview envelopes from FTC pump/nozzle/tank
                  mappings.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmApproved}
                  onChange={(event) => setConfirmApproved(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  I confirm this preview is tied to the approved maintenance
                  session shown above.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmPreviewOnly}
                  onChange={(event) =>
                    setConfirmPreviewOnly(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>I understand this is preview-only planning output.</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmNoCommand}
                  onChange={(event) =>
                    setConfirmNoCommand(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>
                  I confirm no DOMS/PSS command will be sent by this action.
                </span>
              </label>
            </div>
            <div className="space-y-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional preview note, for example: generated after comparing latest FcInstallStatus with PSS Configurator export."
                className="min-h-28 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={generatePreview}
                  disabled={!canGenerate}
                >
                  {generating ? 'Generating...' : 'Generate preview'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={exportPreview}
                  disabled={!previewPayload}
                >
                  Export preview JSON
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 text-sm font-semibold">Command previews</div>
          {previews.length ? (
            <div className="space-y-3">
              {previews.map((preview: any) => (
                <div key={preview.id} className="rounded border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(preview.validationStatus)}>
                      {preview.validationStatus}
                    </Badge>
                    <Badge variant={statusVariant(preview.risk)}>
                      {preview.risk}
                    </Badge>
                    <Badge variant={STATUS_VARIANT.NEUTRAL}>
                      {preview.category}
                    </Badge>
                    <span className="font-medium">{preview.title}</span>
                  </div>
                  <div className="mt-2 text-[var(--text-secondary)]">
                    {preview.description}
                  </div>
                  <div className="mt-2 text-xs text-amber-700">
                    {preview.safetyNote}
                  </div>
                  {preview.blockers?.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
                      {preview.blockers.map(
                        (blocker: string, index: number) => (
                          <li key={`${preview.id}-blocker-${index}`}>
                            {blocker}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                  {preview.envelope ? (
                    <pre className="mt-3 max-h-72 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-primary)]">
                      {JSON.stringify(preview.envelope, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--text-secondary)]">
              No preview has been generated yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
