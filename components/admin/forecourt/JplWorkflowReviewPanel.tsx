'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const ts =
    typeof value === 'number' ? value : new Date(String(value)).getTime()
  if (!Number.isFinite(ts)) return String(value)
  return new Date(ts).toLocaleString()
}

const statusVariant = (status: unknown) => {
  const normalized = String(status ?? '').toLowerCase()
  if (
    ['completed', 'success', 'confirmed_on_doms', 'cleared_on_doms'].includes(
      normalized,
    )
  ) {
    return STATUS_VARIANT.SUCCESS
  }
  if (
    ['failed', 'error', 'clear_failed', 'completed_with_errors'].includes(
      normalized,
    )
  ) {
    return STATUS_VARIANT.ERROR
  }
  if (['warning', 'warn', 'alarm'].includes(normalized)) {
    return STATUS_VARIANT.NEUTRAL
  }
  if (
    ['pending', 'pending_clear', 'sent', 'submitted_local'].includes(normalized)
  ) {
    return STATUS_VARIANT.NEUTRAL
  }
  return STATUS_VARIANT.INFO
}

function MiniTable({
  empty,
  children,
}: {
  empty: boolean
  children: ReactNode
}) {
  if (empty) {
    return (
      <div className="text-sm text-[var(--text-muted)]">No records found.</div>
    )
  }
  return <div className="overflow-auto">{children}</div>
}

export function JplWorkflowReviewPanel() {
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryConfirm, setRecoveryConfirm] = useState('')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', '50')
    if (command.trim()) params.set('command', command.trim())
    if (status.trim()) params.set('status', status.trim())
    if (correlationId.trim()) params.set('correlationId', correlationId.trim())
    return params.toString()
  }, [command, status, correlationId])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>(`/api/admin/forecourt/workflows?${query}`)
      if (!response.success) {
        throw new Error(response.error || 'Failed to load workflow overview')
      }
      setPayload(response.data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load workflow overview')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    fetch('/api/security/csrf', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (typeof json?.token === 'string') setCsrfToken(json.token)
      })
      .catch(() => setCsrfToken(''))
  }, [])

  const runRecovery = async (dryRun: boolean) => {
    setRecoveryBusy(true)
    setRecoveryMessage('')
    setRecoveryError('')
    try {
      const response = await api<any>(
        '/api/admin/forecourt/transactions/recovery',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            dryRun,
            confirmRecovery: recoveryConfirm.trim(),
            limit: 50,
            maxClearAttempts: 5,
            csrf_token: csrfToken,
          }),
        },
      )
      if (!response.success) {
        throw new Error(response.error || 'Transaction recovery failed')
      }

      const data = response.data
      setRecoveryMessage(
        `${dryRun ? 'Recovery dry-run' : 'Recovery run'} ${data?.status ?? 'completed'}: ${data?.clearSuccessCount ?? 0} cleared, ${data?.failedCount ?? 0} failed, ${data?.blockedCount ?? 0} blocked.`,
      )
      await load()
    } catch (err: any) {
      setRecoveryError(err?.message || 'Transaction recovery failed')
    } finally {
      setRecoveryBusy(false)
    }
  }

  const commandHistory = payload?.commandHistory ?? []
  const deliveryCheckpoints = payload?.wetstock?.deliveryCheckpoints ?? []
  const pendingPriceSets = payload?.prices?.pendingPriceSets ?? []
  const priceScheduleEvents = payload?.prices?.scheduleEvents ?? []
  const transactions = payload?.transactions ?? []
  const transactionCheckpoints = payload?.replay?.transactionCheckpoints ?? []
  const pendingReplayClears = payload?.replay?.pendingReplayClears ?? []
  const recoveryRuns = payload?.replay?.transactionRecoveryRuns ?? []
  const replayMetrics = payload?.replay?.metrics ?? {}
  const serviceRecordWorkflow = payload?.specialRecords?.serviceMessages ?? {}
  const borRecordWorkflow = payload?.specialRecords?.backOfficeRecords ?? {}
  const serviceMessages = serviceRecordWorkflow.recent ?? []
  const borRecords = borRecordWorkflow.recent ?? []
  const borReplayCandidates = borRecordWorkflow.replayCandidates ?? []
  const washWorkflow = payload?.washTransactions ?? {}
  const washTransactions = washWorkflow.recent ?? []
  const pendingWashClears = washWorkflow.pendingClear ?? []
  const washReview = washWorkflow.review ?? []
  const optionalWorkflow = payload?.optionalModules ?? {}
  const optionalSnapshots = optionalWorkflow.snapshots ?? []
  const optionalErrors = optionalWorkflow.errors ?? []
  const vendingTotals = optionalWorkflow.vendingTotals ?? []
  const dynamicTankWorkflow = payload?.dynamicTankData ?? {}
  const dynamicTankAudits = dynamicTankWorkflow.recent ?? []

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              Production workflow review
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Persistent command history, delivery clear checkpoints, scheduled
              price state, and recent transaction buffer records.
            </p>
          </div>
          <Button type="button" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh workflows'}
          </Button>
        </div>

        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">Command filter</span>
            <Input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="GET_GRADE_PRICES"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Status filter</span>
            <Input
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="PENDING / COMPLETED / FAILED"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Correlation ID</span>
            <Input
              value={correlationId}
              onChange={(event) => setCorrelationId(event.target.value)}
              placeholder="optional correlationId search"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Commands
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {commandHistory.length}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Pending delivery clears
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {payload?.wetstock?.pendingClearCount ?? 0}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Pending price sets
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {pendingPriceSets.length}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Recent transactions
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {transactions.length}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Active checkpoints
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {transactionCheckpoints.length}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Special records
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {(serviceRecordWorkflow.reviewCount ?? 0) +
                (borRecordWorkflow.pendingCount ?? 0) +
                (borRecordWorkflow.failedCount ?? 0)}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Wash clears
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {washWorkflow.pendingClearCount ?? pendingWashClears.length}
            </div>
          </div>
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Optional alerts
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {(optionalWorkflow.warningOrErrorCount ?? 0) +
                (optionalWorkflow.openErrorCount ?? 0)}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded border bg-[var(--surface-card)] p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                DOMS backlog
              </div>
              <div className="text-lg font-semibold">
                {replayMetrics.inMemoryBacklogDepth ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Pending clears
              </div>
              <div className="text-lg font-semibold">
                {replayMetrics.pendingReplayClearCount ??
                  pendingReplayClears.length}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Stale locks
              </div>
              <div className="text-lg font-semibold">
                {replayMetrics.staleLockCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Failed clears
              </div>
              <div className="text-lg font-semibold">
                {replayMetrics.failedClearCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Active checkpoints
              </div>
              <div className="text-lg font-semibold">
                {replayMetrics.activeCheckpointCount ??
                  transactionCheckpoints.length}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                Transaction-buffer recovery
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Dry-run or manually retry durable DOMS/JPL transaction clear
                checkpoints. Foreign POS locks are surfaced for operator action
                and are not automatically released.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => runRecovery(true)}
                disabled={!csrfToken || recoveryBusy}
              >
                {recoveryBusy ? 'Working…' : 'Dry-run recovery'}
              </Button>
              <Button
                type="button"
                onClick={() => runRecovery(false)}
                disabled={
                  !csrfToken ||
                  recoveryBusy ||
                  recoveryConfirm.trim() !== 'RECOVER_DOMS_TRANSACTIONS'
                }
              >
                Run confirmed recovery
              </Button>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              Live recovery confirmation
            </span>
            <Input
              value={recoveryConfirm}
              onChange={(event) => setRecoveryConfirm(event.target.value)}
              placeholder="Type RECOVER_DOMS_TRANSACTIONS to enable live retry"
            />
          </label>
          {recoveryMessage ? (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700">
              {recoveryMessage}
            </div>
          ) : null}
          {recoveryError ? (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700">
              {recoveryError}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded border bg-[var(--surface-card)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">DOMS special records</div>
              <p className="text-xs text-[var(--text-secondary)]">
                Service-log messages and back-office records are persisted
                before clear attempts. Unknown service messages and replayable
                BORs stay visible here until reviewed or processed by a
                downstream workflow.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Service review
              </div>
              <div className="text-lg font-semibold">
                {serviceRecordWorkflow.reviewCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Escalated service
              </div>
              <div className="text-lg font-semibold">
                {serviceRecordWorkflow.escalatedCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                BOR replay pending
              </div>
              <div className="text-lg font-semibold">
                {borRecordWorkflow.pendingCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                BOR replay failed
              </div>
              <div className="text-lg font-semibold">
                {borRecordWorkflow.failedCount ?? 0}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold">
                Recent service-log messages
              </div>
              <MiniTable empty={serviceMessages.length === 0}>
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-1">Collected</th>
                      <th className="px-2 py-1">Seq</th>
                      <th className="px-2 py-1">Route</th>
                      <th className="px-2 py-1">Severity</th>
                      <th className="px-2 py-1">Clear</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceMessages.slice(0, 10).map((row: any) => (
                      <tr
                        key={`${row.fc_service_msg_seq_no}-${row.collected_at}`}
                        className="border-t"
                      >
                        <td className="whitespace-nowrap px-2 py-1">
                          {fmtTs(row.collected_at)}
                        </td>
                        <td className="px-2 py-1">
                          {row.fc_service_msg_seq_no ?? '—'}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant={statusVariant(row.route_status)}>
                            {row.route_key ?? row.route_status ?? 'unknown'}
                          </Badge>
                        </td>
                        <td className="px-2 py-1">
                          {row.route_severity ?? 'unknown'}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant={statusVariant(row.status)}>
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MiniTable>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">
                Replayable back-office records
              </div>
              <MiniTable empty={borReplayCandidates.length === 0}>
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-1">Collected</th>
                      <th className="px-2 py-1">Seq</th>
                      <th className="px-2 py-1">Format</th>
                      <th className="px-2 py-1">Kind</th>
                      <th className="px-2 py-1">Processing</th>
                      <th className="px-2 py-1">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borReplayCandidates.slice(0, 10).map((row: any) => (
                      <tr
                        key={`${row.bor_seq_no}-${row.source_hash}`}
                        className="border-t"
                      >
                        <td className="whitespace-nowrap px-2 py-1">
                          {fmtTs(row.collected_at)}
                        </td>
                        <td className="px-2 py-1">{row.bor_seq_no}</td>
                        <td className="px-2 py-1">
                          {row.bor_format_id ?? row.sub_code ?? '—'}
                        </td>
                        <td className="px-2 py-1">
                          {row.record_kind ?? 'unknown'}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant={statusVariant(row.processing_status)}>
                            {row.processing_status}
                          </Badge>
                        </td>
                        <td className="px-2 py-1">
                          {row.process_attempts ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MiniTable>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              Active transaction checkpoints
            </div>
            <MiniTable empty={transactionCheckpoints.length === 0}>
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Updated</th>
                    <th className="px-2 py-1">Mode</th>
                    <th className="px-2 py-1">FpId</th>
                    <th className="px-2 py-1">Seq</th>
                    <th className="px-2 py-1">Stage</th>
                    <th className="px-2 py-1">Attempts</th>
                    <th className="px-2 py-1">Lock</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionCheckpoints.slice(0, 12).map((row: any) => (
                    <tr
                      key={`${row.sourceMode}-${row.fpId}-${row.transSeqNo}`}
                      className="border-t"
                    >
                      <td className="whitespace-nowrap px-2 py-1">
                        {fmtTs(row.updatedAt)}
                      </td>
                      <td className="px-2 py-1">{row.sourceMode}</td>
                      <td className="px-2 py-1">{row.fpId}</td>
                      <td className="px-2 py-1">{row.transSeqNo}</td>
                      <td className="px-2 py-1">
                        <Badge variant={statusVariant(row.lifecycleStage)}>
                          {row.lifecycleStage}
                        </Badge>
                      </td>
                      <td className="px-2 py-1">
                        R{row.readAttempts ?? 0} / C{row.clearAttempts ?? 0}
                      </td>
                      <td className="px-2 py-1">
                        {row.blockedByForeignPos
                          ? `foreign:${row.lockId ?? 'unknown'}`
                          : (row.lockId ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MiniTable>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Recent recovery runs</div>
            <MiniTable empty={recoveryRuns.length === 0}>
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Started</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Rows</th>
                    <th className="px-2 py-1">Retried</th>
                    <th className="px-2 py-1">Cleared</th>
                    <th className="px-2 py-1">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveryRuns.slice(0, 10).map((row: any) => (
                    <tr key={row.id} className="border-t">
                      <td className="whitespace-nowrap px-2 py-1">
                        {fmtTs(row.startedAt)}
                      </td>
                      <td className="px-2 py-1">
                        <Badge variant={statusVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-1">{row.rowsScanned}</td>
                      <td className="px-2 py-1">{row.retriesAttempted}</td>
                      <td className="px-2 py-1">{row.clearSuccessCount}</td>
                      <td className="px-2 py-1">{row.failedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MiniTable>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Wash transaction clears</div>
          <p className="text-xs text-[var(--text-secondary)]">
            DOMS wash transactions are unsupervised/prepaid records. This view
            shows captured clear candidates and zero/error transactions
            requiring operator review before downstream automation is enabled.
          </p>
          <MiniTable empty={washTransactions.length === 0}>
            <table className="min-w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1">Updated</th>
                  <th className="px-2 py-1">WpId</th>
                  <th className="px-2 py-1">Seq</th>
                  <th className="px-2 py-1">Money</th>
                  <th className="px-2 py-1">Program</th>
                  <th className="px-2 py-1">Review</th>
                  <th className="px-2 py-1">Clear</th>
                </tr>
              </thead>
              <tbody>
                {washTransactions.slice(0, 12).map((row: any) => (
                  <tr key={row.id} className="border-t">
                    <td className="whitespace-nowrap px-2 py-1">
                      {fmtTs(row.updated_at)}
                    </td>
                    <td className="px-2 py-1">{row.wp_id ?? '—'}</td>
                    <td className="px-2 py-1">{row.wp_trans_seq_no ?? '—'}</td>
                    <td className="px-2 py-1">{row.money ?? '—'}</td>
                    <td className="px-2 py-1">
                      {row.wash_program_no ?? row.fc_wash_id ?? '—'}
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.review_status)}>
                        {row.review_status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.clear_status)}>
                        {row.clear_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MiniTable>
          {washReview.length ? (
            <div className="text-xs text-[var(--text-secondary)]">
              {washReview.length} wash transaction(s) require review.
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded border bg-[var(--surface-card)] p-3">
          <div>
            <div className="text-sm font-semibold">Dynamic tank data audit</div>
            <p className="text-xs text-[var(--text-secondary)]">
              Manual tank data mutation is restricted to EnteredDensity and is
              audited before the command is sent to DOMS. Warnings highlight
              missing business reasons or unexpected operator roles.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Recent changes
              </div>
              <div className="text-lg font-semibold">
                {dynamicTankWorkflow.totalRecent ?? dynamicTankAudits.length}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Warnings
              </div>
              <div className="text-lg font-semibold">
                {dynamicTankWorkflow.warningCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Failed sends
              </div>
              <div className="text-lg font-semibold">
                {dynamicTankWorkflow.failedCount ?? 0}
              </div>
            </div>
          </div>
          <MiniTable empty={dynamicTankAudits.length === 0}>
            <table className="min-w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1">Updated</th>
                  <th className="px-2 py-1">Tank</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Severity</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {dynamicTankAudits.slice(0, 10).map((row: any) => (
                  <tr key={row.id} className="border-t">
                    <td className="whitespace-nowrap px-2 py-1">
                      {fmtTs(row.updated_at)}
                    </td>
                    <td className="px-2 py-1">{row.tank_id ?? '—'}</td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.status)}>
                        {row.status ?? 'requested'}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.severity)}>
                        {row.severity ?? 'info'}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">{row.requested_role ?? '—'}</td>
                    <td className="max-w-[300px] truncate px-2 py-1">
                      {row.reason ?? row.error_text ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MiniTable>
        </div>

        <div className="space-y-3 rounded border bg-[var(--surface-card)] p-3">
          <div>
            <div className="text-sm font-semibold">
              Optional DOMS module runtime
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Price poles, digital I/O pins, sensors, and vending machines are
              persisted as first-class runtime snapshots when those protocol
              families are observed. Open alarms and vending totals stay visible
              for support without inspecting raw JPL logs.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Devices seen
              </div>
              <div className="text-lg font-semibold">
                {optionalSnapshots.length}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Warning/error devices
              </div>
              <div className="text-lg font-semibold">
                {optionalWorkflow.warningOrErrorCount ?? 0}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Open optional faults
              </div>
              <div className="text-lg font-semibold">
                {optionalWorkflow.openErrorCount ?? optionalErrors.length}
              </div>
            </div>
            <div className="rounded border bg-[var(--surface-card)] p-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Vending totals
              </div>
              <div className="text-lg font-semibold">
                {vendingTotals.length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold">
                Recent optional device snapshots
              </div>
              <MiniTable empty={optionalSnapshots.length === 0}>
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-1">Seen</th>
                      <th className="px-2 py-1">Family</th>
                      <th className="px-2 py-1">Id</th>
                      <th className="px-2 py-1">State</th>
                      <th className="px-2 py-1">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optionalSnapshots.slice(0, 12).map((row: any) => (
                      <tr key={row.id} className="border-t">
                        <td className="whitespace-nowrap px-2 py-1">
                          {fmtTs(row.updated_at ?? row.last_seen_at)}
                        </td>
                        <td className="px-2 py-1">
                          {row.device_family ?? '—'}
                        </td>
                        <td className="px-2 py-1">{row.device_id ?? '—'}</td>
                        <td className="px-2 py-1">
                          {row.main_state ?? row.operational_status ?? '—'}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant={statusVariant(row.severity)}>
                            {row.severity ?? 'info'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MiniTable>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">
                Open optional device faults
              </div>
              <MiniTable empty={optionalErrors.length === 0}>
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-1">Updated</th>
                      <th className="px-2 py-1">Family</th>
                      <th className="px-2 py-1">Id</th>
                      <th className="px-2 py-1">Error</th>
                      <th className="px-2 py-1">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optionalErrors.slice(0, 12).map((row: any) => (
                      <tr key={row.id} className="border-t">
                        <td className="whitespace-nowrap px-2 py-1">
                          {fmtTs(row.updated_at ?? row.discovered_at)}
                        </td>
                        <td className="px-2 py-1">
                          {row.device_family ?? '—'}
                        </td>
                        <td className="px-2 py-1">{row.device_id ?? '—'}</td>
                        <td className="max-w-[260px] truncate px-2 py-1">
                          {row.error_name ??
                            row.error_code ??
                            row.error_text ??
                            '—'}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant={statusVariant(row.severity)}>
                            {row.severity ?? 'error'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MiniTable>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Recent vending totals</div>
            <MiniTable empty={vendingTotals.length === 0}>
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Captured</th>
                    <th className="px-2 py-1">VmId</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Grand count</th>
                    <th className="px-2 py-1">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {vendingTotals.slice(0, 8).map((row: any) => (
                    <tr key={row.id} className="border-t">
                      <td className="whitespace-nowrap px-2 py-1">
                        {fmtTs(row.updated_at ?? row.captured_at)}
                      </td>
                      <td className="px-2 py-1">{row.vm_id ?? '—'}</td>
                      <td className="px-2 py-1">
                        {row.vm_total_type_label ?? row.vm_total_type ?? '—'}
                      </td>
                      <td className="px-2 py-1">
                        {row.grand_count_total ?? row.grand_money_total ?? '—'}
                      </td>
                      <td className="px-2 py-1">{row.item_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MiniTable>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Pending replay clears</div>
          <MiniTable empty={pendingReplayClears.length === 0}>
            <table className="min-w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1">FpId</th>
                  <th className="px-2 py-1">Seq</th>
                  <th className="px-2 py-1">Stage</th>
                  <th className="px-2 py-1">Lock</th>
                  <th className="px-2 py-1">Updated</th>
                </tr>
              </thead>
              <tbody>
                {pendingReplayClears.slice(0, 10).map((row: any) => (
                  <tr
                    key={`${row.fpId}-${row.transSeqNo}`}
                    className="border-t"
                  >
                    <td className="px-2 py-1">{row.fpId}</td>
                    <td className="px-2 py-1">{row.transSeqNo}</td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.replayStage)}>
                        {row.replayStage}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">{row.lockId ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {fmtTs(row.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MiniTable>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Recent DOMS transaction captures
          </div>
          <MiniTable empty={transactions.length === 0}>
            <table className="min-w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1">Occurred</th>
                  <th className="px-2 py-1">FpId</th>
                  <th className="px-2 py-1">Seq</th>
                  <th className="px-2 py-1">Money</th>
                  <th className="px-2 py-1">Volume</th>
                  <th className="px-2 py-1">EPT</th>
                  <th className="px-2 py-1">Receipt</th>
                  <th className="px-2 py-1">Card</th>
                  <th className="px-2 py-1">Payment ref</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 12).map((row: any) => (
                  <tr key={row.id} className="border-t">
                    <td className="whitespace-nowrap px-2 py-1">
                      {fmtTs(row.occurred_at)}
                    </td>
                    <td className="px-2 py-1">{row.fp_id ?? '—'}</td>
                    <td className="px-2 py-1">{row.trans_seq_no ?? '—'}</td>
                    <td className="px-2 py-1">{row.money_due ?? '—'}</td>
                    <td className="px-2 py-1">{row.volume ?? '—'}</td>
                    <td className="px-2 py-1">
                      {row.doms_ept_id ?? '—'}
                      {row.doms_ept_sequence_no
                        ? ` / ${row.doms_ept_sequence_no}`
                        : ''}
                    </td>
                    <td className="px-2 py-1">{row.doms_receipt_no ?? '—'}</td>
                    <td className="px-2 py-1">
                      {row.doms_card_label ?? row.doms_card_pan_masked ?? '—'}
                    </td>
                    <td className="max-w-[260px] truncate px-2 py-1">
                      {row.doms_external_payment_reference ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MiniTable>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Persistent command history
          </div>
          <MiniTable empty={commandHistory.length === 0}>
            <table className="min-w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1">Requested</th>
                  <th className="px-2 py-1">Command</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Result</th>
                  <th className="px-2 py-1">Correlation</th>
                </tr>
              </thead>
              <tbody>
                {commandHistory.slice(0, 12).map((row: any) => (
                  <tr key={row.id} className="border-t">
                    <td className="whitespace-nowrap px-2 py-1">
                      {fmtTs(row.requested_at)}
                    </td>
                    <td className="px-2 py-1 font-medium">{row.command}</td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.status)}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant={statusVariant(row.result_status)}>
                        {row.result_status ?? '—'}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-1">
                      {row.correlation_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MiniTable>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              Wetstock delivery clear checkpoints
            </div>
            <MiniTable empty={deliveryCheckpoints.length === 0}>
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Last event</th>
                    <th className="px-2 py-1">TgId</th>
                    <th className="px-2 py-1">Report</th>
                    <th className="px-2 py-1">Tank seq</th>
                    <th className="px-2 py-1">Clear status</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryCheckpoints.slice(0, 10).map((row: any) => (
                    <tr key={row.id} className="border-t">
                      <td className="whitespace-nowrap px-2 py-1">
                        {fmtTs(row.last_event_at)}
                      </td>
                      <td className="px-2 py-1">{row.tg_id}</td>
                      <td className="px-2 py-1">
                        {row.delivery_report_seq_no}
                      </td>
                      <td className="px-2 py-1">{row.tank_delivery_seq_no}</td>
                      <td className="px-2 py-1">
                        <Badge variant={statusVariant(row.clear_status)}>
                          {row.clear_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MiniTable>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Pending price sets</div>
            <MiniTable empty={pendingPriceSets.length === 0}>
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Activation</th>
                    <th className="px-2 py-1">Price set</th>
                    <th className="px-2 py-1">Source</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPriceSets.slice(0, 10).map((row: any) => (
                    <tr
                      key={`${row.price_set_id}-${row.activation_at}`}
                      className="border-t"
                    >
                      <td className="whitespace-nowrap px-2 py-1">
                        {fmtTs(row.activation_at)}
                      </td>
                      <td className="px-2 py-1">{row.price_set_id}</td>
                      <td className="px-2 py-1">{row.source}</td>
                      <td className="px-2 py-1">
                        <Badge variant={statusVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MiniTable>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Recent price schedule events
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {priceScheduleEvents.slice(0, 6).map((row: any) => (
              <div
                key={row.id}
                className="rounded border bg-[var(--surface-card)] p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    Price set {row.price_set_id}
                  </span>
                  <Badge variant={statusVariant(row.event_type)}>
                    {row.event_type}
                  </Badge>
                </div>
                <div className="mt-1 text-[var(--text-secondary)]">
                  Activation: {fmtTs(row.activation_at)}
                </div>
                <div className="text-[var(--text-secondary)]">
                  Recorded: {fmtTs(row.created_at)}
                </div>
              </div>
            ))}
            {priceScheduleEvents.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">
                No schedule events found.
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
