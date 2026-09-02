'use client'

import { useCallback, useEffect, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return String(value)
  return date.toLocaleString()
}

const valueOrDash = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const variantForStatus = (status: unknown) => {
  switch (String(status ?? '').toLowerCase()) {
    case 'approved':
      return STATUS_VARIANT.SUCCESS
    case 'requested':
      return STATUS_VARIANT.INFO
    case 'expired':
      return STATUS_VARIANT.NEUTRAL
    case 'cancelled':
      return STATUS_VARIANT.ERROR
    default:
      return STATUS_VARIANT.NEUTRAL
  }
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

export function JplMaintenanceGatePanel() {
  const [payload, setPayload] = useState<any>(null)
  const [csrfToken, setCsrfToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [reason, setReason] = useState('')
  const [requestedWindow, setRequestedWindow] = useState('')
  const [requestNote, setRequestNote] = useState('')
  const [requestConfirmDryRun, setRequestConfirmDryRun] = useState(false)
  const [requestConfirmNoCommand, setRequestConfirmNoCommand] = useState(false)
  const [requestConfirmPssChecked, setRequestConfirmPssChecked] =
    useState(false)

  const [approvalNote, setApprovalNote] = useState('')
  const [approvalConfirmDryRun, setApprovalConfirmDryRun] = useState(false)
  const [approvalConfirmNoCommand, setApprovalConfirmNoCommand] =
    useState(false)
  const [approvalConfirmSiteChecked, setApprovalConfirmSiteChecked] =
    useState(false)

  const [cancelNote, setCancelNote] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/maintenance/sessions',
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to load maintenance sessions')
      }
      setPayload(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load maintenance sessions')
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

  const sessions = payload?.sessions ?? []
  const pendingSession = payload?.pendingSession ?? null
  const activeSession = payload?.activeSession ?? null
  const latestSession = sessions[0] ?? null
  const currentSession = pendingSession ?? activeSession

  const submit = async (
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/maintenance/sessions',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({ ...body, csrf_token: csrfToken }),
        },
      )
      if (!response.success) {
        throw new Error(response.error || 'Maintenance gate action failed')
      }
      setMessage(successMessage)
      await load()
    } catch (err: any) {
      setError(err?.message || 'Maintenance gate action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const requestSession = async () => {
    await submit(
      {
        action: 'request',
        reason,
        requestedWindow,
        confirmationNote: requestNote,
        confirmDryRunOnly: requestConfirmDryRun,
        confirmNoDomsCommand: requestConfirmNoCommand,
        confirmPssConfiguratorChecked: requestConfirmPssChecked,
      },
      'Maintenance session request recorded. No DOMS/PSS command was sent.',
    )
  }

  const approveSession = async (sessionId: string) => {
    await submit(
      {
        action: 'approve',
        sessionId,
        approvalNote,
        confirmDryRunOnly: approvalConfirmDryRun,
        confirmNoDomsCommand: approvalConfirmNoCommand,
        confirmPhysicalSiteChecked: approvalConfirmSiteChecked,
      },
      'Maintenance session approval recorded. DOMS/PSS write execution remains disabled.',
    )
  }

  const cancelSession = async (sessionId: string) => {
    await submit(
      {
        action: 'cancel',
        sessionId,
        cancellationNote: cancelNote,
        confirmCancel: cancelConfirm,
      },
      'Maintenance session cancelled. No DOMS/PSS command was sent.',
    )
  }

  const canRequest =
    csrfToken &&
    !submitting &&
    reason.trim().length >= 10 &&
    requestConfirmDryRun &&
    requestConfirmNoCommand &&
    requestConfirmPssChecked
  const canApprove =
    csrfToken &&
    !submitting &&
    pendingSession?.id &&
    approvalNote.trim().length >= 10 &&
    approvalConfirmDryRun &&
    approvalConfirmNoCommand &&
    approvalConfirmSiteChecked
  const canCancel =
    csrfToken &&
    !submitting &&
    currentSession?.id &&
    cancelNote.trim().length >= 10 &&
    cancelConfirm

  return (
    <CollapsibleStatusSection
      title="DOMS maintenance approval gate"
      status={currentSession?.status ?? 'idle'}
      statusVariant={variantForStatus(currentSession?.status)}
      contentClassName="p-4 pt-0"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              DOMS maintenance approval gate
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Records approval state for future PSS maintenance work. This gate
              is intentionally non-executing and sends no DOMS commands.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                payload?.executionGate?.enabled
                  ? STATUS_VARIANT.ERROR
                  : STATUS_VARIANT.SUCCESS
              }
            >
              {payload?.executionGate?.enabled
                ? 'execution enabled'
                : 'execution disabled'}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh gate'}
            </Button>
          </div>
        </div>

        {payload?.safetyNotice ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
            {payload.safetyNotice}
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
          <Metric
            label="Pending session"
            value={pendingSession?.id ? 'yes' : 'no'}
          />
          <Metric
            label="Approved session"
            value={activeSession?.id ? 'yes' : 'no'}
          />
          <Metric
            label="Session TTL"
            value={`${payload?.sessionTtlHours ?? 4}h`}
          />
          <Metric
            label="Latest status"
            value={latestSession?.status ?? 'none'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <CollapsibleStatusSection
            title="Request maintenance session"
            status={
              pendingSession
                ? 'pending'
                : activeSession
                  ? 'approved'
                  : 'available'
            }
            statusVariant={
              pendingSession
                ? STATUS_VARIANT.INFO
                : activeSession
                  ? STATUS_VARIANT.SUCCESS
                  : STATUS_VARIANT.NEUTRAL
            }
            contentClassName="p-3 pt-0"
          >
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Request maintenance session
              </div>
              <div className="space-y-3">
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Required reason, for example: compare PSS Configurator export against FTC reconciliation before supervised maintenance."
                  className="min-h-20 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
                />
                <input
                  value={requestedWindow}
                  onChange={(event) => setRequestedWindow(event.target.value)}
                  placeholder="Optional maintenance window, for example: 2026-07-09 22:00 SAST"
                  className="w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
                />
                <textarea
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder="Optional request note"
                  className="min-h-16 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
                />
                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={requestConfirmDryRun}
                    onChange={(event) =>
                      setRequestConfirmDryRun(event.target.checked)
                    }
                    className="mt-1"
                  />
                  <span>I understand this records an approval gate only.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={requestConfirmNoCommand}
                    onChange={(event) =>
                      setRequestConfirmNoCommand(event.target.checked)
                    }
                    className="mt-1"
                  />
                  <span>
                    I confirm no DOMS/PSS command will be sent by this action.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={requestConfirmPssChecked}
                    onChange={(event) =>
                      setRequestConfirmPssChecked(event.target.checked)
                    }
                    className="mt-1"
                  />
                  <span>
                    I have reviewed, or will review, PSS Configurator / physical
                    site context before any maintenance work.
                  </span>
                </label>
                <Button
                  type="button"
                  onClick={requestSession}
                  disabled={!canRequest}
                >
                  {submitting ? 'Recording...' : 'Request session'}
                </Button>
              </div>
            </div>
          </CollapsibleStatusSection>

          <CollapsibleStatusSection
            title="Approve or cancel current session"
            status={currentSession?.status ?? 'no session'}
            statusVariant={variantForStatus(currentSession?.status)}
            contentClassName="p-3 pt-0"
          >
            <div className="rounded border bg-[var(--surface-card)] p-3">
              <div className="mb-2 text-sm font-semibold">
                Approve or cancel current session
              </div>
              {currentSession ? (
                <div className="space-y-3 text-sm">
                  <div className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={variantForStatus(currentSession.status)}>
                        {currentSession.status}
                      </Badge>
                      <span className="font-medium">{currentSession.id}</span>
                    </div>
                    <div className="mt-2 text-[var(--text-secondary)]">
                      Requested: {fmtTs(currentSession.requestedAt)} • Expires:{' '}
                      {fmtTs(currentSession.expiresAt)}
                    </div>
                    <div className="mt-1 text-[var(--text-secondary)]">
                      Reason: {valueOrDash(currentSession.reason)}
                    </div>
                  </div>

                  {pendingSession ? (
                    <div className="space-y-3 rounded border p-3">
                      <div className="font-medium">Approve pending session</div>
                      <textarea
                        value={approvalNote}
                        onChange={(event) =>
                          setApprovalNote(event.target.value)
                        }
                        placeholder="Required approval note"
                        className="min-h-16 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
                      />
                      <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={approvalConfirmDryRun}
                          onChange={(event) =>
                            setApprovalConfirmDryRun(event.target.checked)
                          }
                          className="mt-1"
                        />
                        <span>
                          I understand this approval still does not enable
                          command execution.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={approvalConfirmNoCommand}
                          onChange={(event) =>
                            setApprovalConfirmNoCommand(event.target.checked)
                          }
                          className="mt-1"
                        />
                        <span>
                          I confirm approval sends no DOMS/PSS command.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={approvalConfirmSiteChecked}
                          onChange={(event) =>
                            setApprovalConfirmSiteChecked(event.target.checked)
                          }
                          className="mt-1"
                        />
                        <span>
                          I confirm the physical site / PSS context has been
                          checked for this session.
                        </span>
                      </label>
                      <Button
                        type="button"
                        onClick={() => approveSession(pendingSession.id)}
                        disabled={!canApprove}
                      >
                        {submitting ? 'Approving...' : 'Approve session'}
                      </Button>
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded border border-red-500/20 p-3">
                    <div className="font-medium">Cancel session</div>
                    <textarea
                      value={cancelNote}
                      onChange={(event) => setCancelNote(event.target.value)}
                      placeholder="Required cancellation note"
                      className="min-h-16 w-full rounded border bg-[var(--surface-card)] p-2 text-sm text-[var(--text-primary)]"
                    />
                    <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={cancelConfirm}
                        onChange={(event) =>
                          setCancelConfirm(event.target.checked)
                        }
                        className="mt-1"
                      />
                      <span>I confirm this session should be cancelled.</span>
                    </label>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => cancelSession(currentSession.id)}
                      disabled={!canCancel}
                    >
                      {submitting ? 'Cancelling...' : 'Cancel session'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">
                  No pending or approved maintenance session is currently
                  recorded.
                </div>
              )}
            </div>
          </CollapsibleStatusSection>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-3">
          <div className="mb-2 text-sm font-semibold">
            Recent maintenance sessions
          </div>
          {sessions.length ? (
            <div className="overflow-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="text-xs uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="p-2">Status</th>
                    <th className="p-2">Requested</th>
                    <th className="p-2">Approved</th>
                    <th className="p-2">Reason</th>
                    <th className="p-2">Execution</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 8).map((session: any) => (
                    <tr key={session.id} className="border-t">
                      <td className="p-2">
                        <Badge variant={variantForStatus(session.status)}>
                          {session.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-[var(--text-secondary)]">
                        {fmtTs(session.requestedAt)}
                      </td>
                      <td className="p-2 text-[var(--text-secondary)]">
                        {fmtTs(session.approvedAt)}
                      </td>
                      <td className="p-2 text-[var(--text-secondary)]">
                        {valueOrDash(session.reason)}
                      </td>
                      <td className="p-2 text-[var(--text-secondary)]">
                        {session.executionGate?.enabled
                          ? 'enabled'
                          : 'disabled'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-secondary)]">
              No sessions recorded yet.
            </div>
          )}
        </div>
      </div>
    </CollapsibleStatusSection>
  )
}
