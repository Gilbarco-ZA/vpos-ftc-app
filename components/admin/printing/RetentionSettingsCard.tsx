'use client'

import { useCallback, useEffect, useState } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SectionHeader } from '@/components/ui/section-header'

export type RetentionPolicy = {
  enabled: boolean
  dryRun: boolean
  cleanupIntervalMs: number
  batchSize: number
  maxBatches: number
  printDoneDays: number
  printTestDoneDays: number
  printFailedDays: number
  transactionQueueDoneDays: number
  transactionQueueFailedDays: number
  reportQueueDoneDays: number
  reportQueueFailedDays: number
  fiscalInboxProcessedDays: number
  fiscalInboxResolvedDeadDays: number
  auditLogDays: number
  vposLogDays: number
  forecourtRoutineEventDays: number
  forecourtErrorEventDays: number
  forecourtMaintenanceSecurityEventDays: number
  forecourtFieldEvidenceEventDays: number
  jplCheckpointClearedDays: number
  jplSupervisedReplayClearedDays: number
  configVersionLimit: number
  configVersionMinAgeDays: number
  pssParsedCompatibilityDays: number
  forecourtPayloadCompactionEnabled: boolean
  forecourtPayloadDryRun: boolean
  forecourtPayloadGraceDays: number
}

type DayField = keyof Pick<
  RetentionPolicy,
  | 'printDoneDays'
  | 'printTestDoneDays'
  | 'printFailedDays'
  | 'transactionQueueDoneDays'
  | 'transactionQueueFailedDays'
  | 'reportQueueDoneDays'
  | 'reportQueueFailedDays'
  | 'fiscalInboxProcessedDays'
  | 'fiscalInboxResolvedDeadDays'
  | 'auditLogDays'
  | 'vposLogDays'
  | 'forecourtRoutineEventDays'
  | 'forecourtErrorEventDays'
  | 'forecourtMaintenanceSecurityEventDays'
  | 'forecourtFieldEvidenceEventDays'
  | 'jplCheckpointClearedDays'
  | 'jplSupervisedReplayClearedDays'
  | 'configVersionMinAgeDays'
  | 'pssParsedCompatibilityDays'
  | 'forecourtPayloadGraceDays'
>

const groups: Array<{
  title: string
  description: string
  fields: Array<{ key: DayField; label: string }>
}> = [
  {
    title: 'Printing',
    description: 'Terminal print jobs only. Pending and processing jobs are never age-pruned.',
    fields: [
      { key: 'printDoneDays', label: 'Successful receipt/report jobs' },
      { key: 'printTestDoneDays', label: 'Successful printer test jobs' },
      { key: 'printFailedDays', label: 'Failed print jobs' },
    ],
  },
  {
    title: 'Queues and fiscal inbox',
    description: 'Successful queue work is kept shorter than failures and resolved dead-letter evidence.',
    fields: [
      { key: 'transactionQueueDoneDays', label: 'Transaction queue success' },
      { key: 'transactionQueueFailedDays', label: 'Transaction queue terminal failure' },
      { key: 'reportQueueDoneDays', label: 'Report queue success' },
      { key: 'reportQueueFailedDays', label: 'Report queue terminal failure' },
      { key: 'fiscalInboxProcessedDays', label: 'Processed fiscal inbox' },
      { key: 'fiscalInboxResolvedDeadDays', label: 'Resolved dead fiscal inbox' },
    ],
  },
  {
    title: 'Operations and diagnostics',
    description: 'Retention for logs and bounded forecourt diagnostic evidence.',
    fields: [
      { key: 'auditLogDays', label: 'Audit logs' },
      { key: 'vposLogDays', label: 'VPOS logs' },
      { key: 'forecourtRoutineEventDays', label: 'Routine forecourt events' },
      { key: 'forecourtErrorEventDays', label: 'Forecourt error events' },
      { key: 'forecourtMaintenanceSecurityEventDays', label: 'Maintenance/security events' },
      { key: 'forecourtFieldEvidenceEventDays', label: 'Field evidence events' },
      { key: 'jplCheckpointClearedDays', label: 'Cleared JPL checkpoints' },
      { key: 'jplSupervisedReplayClearedDays', label: 'Cleared supervised replay rows' },
      { key: 'pssParsedCompatibilityDays', label: 'PSS parsed compatibility data' },
    ],
  },
]

function DayInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} max={3650} value={String(value)} onChange={(event) => onChange(Number(event.target.value || 0))} />
        <span className="font-normal">days</span>
      </div>
    </label>
  )
}

export function RetentionSettingsCard() {
  const [csrf, setCsrf] = useState('')
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ variant: 'success' | 'error' | 'info'; text: string } | null>(null)

  const load = useCallback(async () => {
    setBusy('load')
    try {
      const [csrfRes, policyRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch('/api/admin/config/retention', { cache: 'no-store' }),
      ])
      const csrfJson = await csrfRes.json().catch(() => ({}))
      const policyJson = await policyRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrf(csrfJson.token)
      if (!policyRes.ok) throw new Error(policyJson?.error ?? 'Failed to load retention settings')
      setPolicy(policyJson?.data ?? policyJson)
    } catch (error: any) {
      setMessage({ variant: 'error', text: error?.message ?? String(error) })
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!policy) return
    setBusy('save')
    setMessage(null)
    try {
      const res = await fetch('/api/admin/config/retention', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ ...policy, csrf_token: csrf }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'Failed to save retention settings')
      setPolicy(json?.data ?? json)
      setMessage({ variant: 'success', text: 'Retention settings saved. Runtime polling will pick them up without a restart.' })
    } catch (error: any) {
      setMessage({ variant: 'error', text: error?.message ?? String(error) })
    } finally {
      setBusy(null)
    }
  }

  const runNow = async () => {
    setBusy('run')
    setMessage(null)
    try {
      const res = await fetch('/api/admin/config/retention/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ csrf_token: csrf }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'Retention run failed')
      const result = json?.data ?? json
      const deleted = Number(result?.retention?.deleted ?? 0) + Number(result?.printTestJobs?.deleted ?? 0)
      const examined = Number(result?.retention?.examined ?? 0) + Number(result?.printTestJobs?.examined ?? 0)
      setMessage({ variant: 'info', text: result?.dryRun ? `Dry run completed. ${examined} eligible rows were found; nothing was deleted.` : `Cleanup completed. ${deleted} rows were deleted.` })
    } catch (error: any) {
      setMessage({ variant: 'error', text: error?.message ?? String(error) })
    } finally {
      setBusy(null)
    }
  }

  if (!policy) {
    return (
      <Card>
        <CardHeader><CardTitle>Storage retention</CardTitle></CardHeader>
        <CardContent>{busy === 'load' ? 'Loading retention settings…' : 'Retention settings are unavailable.'}</CardContent>
      </Card>
    )
  }

  const setDay = (key: DayField, value: number) => setPolicy((current) => current ? { ...current, [key]: value } : current)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Storage retention</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Production-safe replacement for VPOS_RETENTION_ENABLED, VPOS_RETENTION_DRY_RUN and the retention environment values. Station settings take precedence over environment defaults.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={runNow} disabled={!!busy || !csrf}>{busy === 'run' ? 'Running…' : policy.dryRun ? 'Preview cleanup' : 'Clean up now'}</Button>
            <Button variant="primary" onClick={save} disabled={!!busy || !csrf}>{busy === 'save' ? 'Saving…' : 'Save retention'}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {message ? <Alert variant={message.variant} title="Retention">{message.text}</Alert> : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="flex items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
            <Checkbox checked={policy.enabled} onChange={() => setPolicy({ ...policy, enabled: !policy.enabled })} />
            <span><span className="block text-sm font-semibold">Enable automatic retention</span><span className="text-xs text-[var(--text-secondary)]">Equivalent to VPOS_RETENTION_ENABLED. The worker rechecks this station setting every minute.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
            <Checkbox checked={policy.dryRun} onChange={() => setPolicy({ ...policy, dryRun: !policy.dryRun })} />
            <span><span className="block text-sm font-semibold">Dry-run only</span><span className="text-xs text-[var(--text-secondary)]">Equivalent to VPOS_RETENTION_DRY_RUN. Keep enabled while validating policy values.</span></span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]"><span>Cleanup interval</span><div className="flex items-center gap-2"><Input type="number" min={1} value={String(Math.round(policy.cleanupIntervalMs / 60000))} onChange={(event) => setPolicy({ ...policy, cleanupIntervalMs: Math.max(1, Number(event.target.value || 1)) * 60000 })} /><span className="font-normal">minutes</span></div></label>
          <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]"><span>Batch size</span><Input type="number" min={1} max={5000} value={String(policy.batchSize)} onChange={(event) => setPolicy({ ...policy, batchSize: Number(event.target.value || 1) })} /></label>
          <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]"><span>Maximum batches per run</span><Input type="number" min={1} max={100} value={String(policy.maxBatches)} onChange={(event) => setPolicy({ ...policy, maxBatches: Number(event.target.value || 1) })} /></label>
        </div>

        {groups.map((group) => (
          <div key={group.title} className="space-y-3 rounded-2xl border border-[var(--border-default)] p-4">
            <SectionHeader title={group.title} description={group.description} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.fields.map((field) => <DayInput key={field.key} label={field.label} value={policy[field.key]} onChange={(value) => setDay(field.key, value)} />)}
            </div>
          </div>
        ))}

        <div className="space-y-3 rounded-2xl border border-[var(--border-default)] p-4">
          <SectionHeader title="Configuration history and payload compaction" description="Advanced retention controls. These affect more than printing and should normally remain at their defaults." />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]"><span>Config versions retained</span><Input type="number" min={1} max={1000} value={String(policy.configVersionLimit)} onChange={(event) => setPolicy({ ...policy, configVersionLimit: Number(event.target.value || 1) })} /></label>
            <DayInput label="Config version minimum age" value={policy.configVersionMinAgeDays} onChange={(value) => setDay('configVersionMinAgeDays', value)} />
            <DayInput label="Forecourt payload grace period" value={policy.forecourtPayloadGraceDays} onChange={(value) => setDay('forecourtPayloadGraceDays', value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl bg-[var(--surface-muted)] p-3"><Checkbox checked={policy.forecourtPayloadCompactionEnabled} onChange={() => setPolicy({ ...policy, forecourtPayloadCompactionEnabled: !policy.forecourtPayloadCompactionEnabled })} /><span className="text-sm">Enable forecourt payload compaction</span></label>
            <label className="flex items-start gap-3 rounded-xl bg-[var(--surface-muted)] p-3"><Checkbox checked={policy.forecourtPayloadDryRun} onChange={() => setPolicy({ ...policy, forecourtPayloadDryRun: !policy.forecourtPayloadDryRun })} /><span className="text-sm">Forecourt payload compaction dry-run</span></label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
