'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
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

export function JplMaintenanceExecutionGatePanel() {
  const [csrfToken, setCsrfToken] = useState('')
  const [policy, setPolicy] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [commandPreviewId, setCommandPreviewId] = useState('')
  const [commandName, setCommandName] = useState('')
  const [confirmDisabled, setConfirmDisabled] = useState(false)
  const [confirmNoCommand, setConfirmNoCommand] = useState(false)
  const [confirmPreviewOnly, setConfirmPreviewOnly] = useState(false)

  const activeSession = policy?.activeSession ?? null

  const loadPolicy = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/maintenance/execution-gate',
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to load execution gate')
      }
      setPolicy(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load execution gate')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadPolicy()
    })
    fetch('/api/security/csrf', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data?.token === 'string') setCsrfToken(data.token)
      })
      .catch(() => setCsrfToken(''))
  }, [loadPolicy])

  const canRecordBlockedAttempt = useMemo(
    () =>
      Boolean(
        csrfToken &&
        confirmDisabled &&
        confirmNoCommand &&
        confirmPreviewOnly &&
        !recording,
      ),
    [
      confirmDisabled,
      confirmNoCommand,
      confirmPreviewOnly,
      csrfToken,
      recording,
    ],
  )

  const recordBlockedAttempt = async () => {
    setRecording(true)
    setError('')
    setMessage('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/maintenance/execution-gate',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            sessionId: activeSession?.id ?? null,
            commandPreviewId,
            commandName,
            note,
            confirmExecutionDisabled: confirmDisabled,
            confirmNoDomsCommand: confirmNoCommand,
            confirmPreviewOnly,
            csrf_token: csrfToken,
          }),
        },
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to record blocked attempt')
      }

      setMessage(
        `Blocked execution attempt recorded. Audit log: ${response.data?.auditLogId ?? 'created'}.`,
      )
      setNote('')
      setCommandPreviewId('')
      setCommandName('')
      await loadPolicy()
    } catch (err: any) {
      setError(err?.message || 'Failed to record blocked attempt')
    } finally {
      setRecording(false)
    }
  }

  return (
    <CollapsibleStatusSection
      title="DOMS maintenance execution gate"
      status={policy?.hardDisabled ? 'hard disabled' : 'enabled'}
      statusVariant={
        policy?.hardDisabled ? STATUS_VARIANT.ERROR : STATUS_VARIANT.SUCCESS
      }
      contentClassName="p-0"
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold">
                DOMS maintenance execution gate
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Central safety policy for high-risk DOMS/PSS maintenance write
                operations. Execution remains disabled; this panel exposes the
                policy and records blocked attempts for audit review.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  policy?.hardDisabled
                    ? STATUS_VARIANT.ERROR
                    : STATUS_VARIANT.SUCCESS
                }
              >
                {policy?.hardDisabled ? 'hard disabled' : 'enabled'}
              </Badge>
              <Badge
                variant={
                  policy?.sendsDomsCommand
                    ? STATUS_VARIANT.ERROR
                    : STATUS_VARIANT.NEUTRAL
                }
              >
                {policy?.sendsDomsCommand ? 'can send' : 'no send'}
              </Badge>
              <Button
                type="button"
                variant="secondary"
                onClick={loadPolicy}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh policy'}
              </Button>
            </div>
          </div>

          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            DOMS/PSS install and clear-install execution is disabled in this
            application layer. Approved maintenance sessions currently allow
            planning, preview, audit, and FTC-side mapping work only.
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
            <Metric label="Mode" value={policy?.mode} />
            <Metric
              label="Can execute"
              value={policy?.canExecute ? 'yes' : 'no'}
            />
            <Metric
              label="Can preview"
              value={policy?.canPreview ? 'yes' : 'no'}
            />
            <Metric label="Active session" value={activeSession?.id} />
            <Metric label="Session status" value={activeSession?.status} />
            <Metric
              label="Session expires"
              value={fmtTs(activeSession?.expiresAt)}
            />
            <Metric
              label="Pending session"
              value={policy?.pendingSession?.id}
            />
            <Metric label="Generated" value={fmtTs(policy?.generatedAt)} />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">Blocking policy</div>
              {policy?.blockers?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                  {policy.blockers.map((blocker: string, index: number) => (
                    <li key={`blocker-${index}`}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">
                  No policy loaded.
                </div>
              )}
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Allowed without execution
              </div>
              {policy?.allowedWithoutExecution?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                  {policy.allowedWithoutExecution.map(
                    (item: string, index: number) => (
                      <li key={`allowed-${index}`}>{item}</li>
                    ),
                  )}
                </ul>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">
                  No policy loaded.
                </div>
              )}
            </div>
          </div>

          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 text-sm font-semibold">
              Future execution requirements
            </div>
            {policy?.futureExecutionRequirements?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                {policy.futureExecutionRequirements.map(
                  (item: string, index: number) => (
                    <li key={`requirement-${index}`}>{item}</li>
                  ),
                )}
              </ul>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No policy loaded.
              </div>
            )}
          </div>

          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 text-sm font-semibold">
              Record blocked execution attempt
            </div>
            <p className="mb-3 text-sm text-[var(--text-secondary)]">
              Use this only when reviewing a previewed maintenance command that
              cannot be executed yet. The action records an audit event and
              still sends no DOMS/PSS command.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={commandPreviewId}
                onChange={(event) => setCommandPreviewId(event.target.value)}
                placeholder="Optional preview ID"
                className="rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
              />
              <input
                value={commandName}
                onChange={(event) => setCommandName(event.target.value)}
                placeholder="Optional command name, for example install_Fp_req"
                className="rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
              />
            </div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional audit note explaining why the blocked attempt was recorded."
              className="mt-3 min-h-24 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
            />
            <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmDisabled}
                  onChange={(event) => setConfirmDisabled(event.target.checked)}
                  className="mt-1"
                />
                <span>I confirm DOMS/PSS write execution is disabled.</span>
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
                  I confirm this action will send no DOMS/PSS command.
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
                <span>
                  I understand this is audit-only and preview-related.
                </span>
              </label>
            </div>
            <div className="mt-3">
              <Button
                type="button"
                variant="destructive"
                onClick={recordBlockedAttempt}
                disabled={!canRecordBlockedAttempt}
              >
                {recording ? 'Recording...' : 'Record blocked attempt'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </CollapsibleStatusSection>
  )
}
