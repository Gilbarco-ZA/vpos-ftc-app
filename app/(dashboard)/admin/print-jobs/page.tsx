'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const STATUSES = ['', 'PENDING', 'PROCESSING', 'DONE', 'FAILED'] as const

type PrintJob = {
  id: string
  job_type: string
  status: string
  priority: number
  attempts: number
  max_attempts: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  last_error: string | null
  source_transaction_id: string | null
  source_report_id: string | null
  created_at: string
  updated_at: string
  printer_key: string | null
}

type Summary = Record<'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED', number>

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 8)}…` : '—'

export default function PrintJobsPage() {
  const [csrf, setCsrf] = useState('')
  const [jobs, setJobs] = useState<PrintJob[]>([])
  const [summary, setSummary] = useState<Summary>({ PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0 })
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ variant: 'success' | 'error' | 'info'; text: string } | null>(null)

  const types = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.job_type))).sort(),
    [jobs],
  )

  const load = useCallback(async () => {
    setBusy('load')
    try {
      const params = new URLSearchParams({ limit: '150' })
      if (status) params.set('status', status)
      if (type) params.set('type', type)
      if (search.trim()) params.set('search', search.trim())
      const [csrfRes, jobsRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch(`/api/admin/print-jobs?${params.toString()}`, { cache: 'no-store' }),
      ])
      const csrfJson = await csrfRes.json().catch(() => ({}))
      const jobsJson = await jobsRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrf(csrfJson.token)
      if (!jobsRes.ok) throw new Error(jobsJson?.error ?? 'Failed to load print jobs')
      const data = jobsJson?.data ?? jobsJson
      setJobs(Array.isArray(data?.jobs) ? data.jobs : [])
      setSummary({
        PENDING: Number(data?.summary?.PENDING ?? 0),
        PROCESSING: Number(data?.summary?.PROCESSING ?? 0),
        DONE: Number(data?.summary?.DONE ?? 0),
        FAILED: Number(data?.summary?.FAILED ?? 0),
      })
    } catch (error: any) {
      setMessage({ variant: 'error', text: error?.message ?? String(error) })
    } finally {
      setBusy(null)
    }
  }, [search, status, type])

  useEffect(() => { void load() }, [load])

  const mutateJob = async (jobId: string, action: 'retry' | 'clear') => {
    setBusy(`${action}:${jobId}`)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/print-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ csrf_token: csrf, jobId, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Failed to ${action} print job`)
      const data = json?.data ?? json
      setMessage({
        variant: 'success',
        text: action === 'retry'
          ? `Retry queued as ${data?.jobId ?? 'a new print job'}. The failed job was retained for history.`
          : 'Terminal print job cleared.',
      })
      await load()
    } catch (error: any) {
      setMessage({ variant: 'error', text: error?.message ?? String(error) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Print Jobs"
        description="Monitor queued printer work, investigate failures, retry failed jobs, and clear completed history."
        actions={<Button variant="secondary" onClick={load} disabled={!!busy}>{busy === 'load' ? 'Refreshing…' : 'Refresh'}</Button>}
      />

      {message ? <Alert variant={message.variant} title="Print jobs">{message.text}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['PENDING', 'PROCESSING', 'DONE', 'FAILED'] as const).map((key) => (
          <button type="button" key={key} onClick={() => setStatus(status === key ? '' : key)} className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4 text-left hover:bg-[var(--surface-muted)]">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">{key}</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{summary[key]}</div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Queue history</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, transaction, report or error" />
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((value) => <option key={value || 'all'} value={value}>{value || 'All statuses'}</option>)}
            </Select>
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">All job types</option>
              {types.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                <tr><th className="px-3 py-2">Created</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Printer</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Attempts</th><th className="px-3 py-2">Completed</th><th className="px-3 py-2">Error</th><th className="px-3 py-2">Actions</th></tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-[var(--border-default)] align-top">
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(job.created_at)}</td>
                    <td className="px-3 py-3"><div className="font-medium">{job.job_type}</div><div className="text-xs text-[var(--text-secondary)]" title={job.id}>{shortId(job.id)}</div></td>
                    <td className="px-3 py-3">{job.printer_key || 'default'}</td>
                    <td className="px-3 py-3">{job.source_transaction_id ? <div title={job.source_transaction_id}>Transaction {shortId(job.source_transaction_id)}</div> : null}{job.source_report_id ? <div title={job.source_report_id}>Report {shortId(job.source_report_id)}</div> : null}{!job.source_transaction_id && !job.source_report_id ? '—' : null}</td>
                    <td className="px-3 py-3"><Badge variant={job.status === 'DONE' ? 'success' : job.status === 'FAILED' ? 'error' : job.status === 'PROCESSING' ? 'info' : 'neutral'}>{job.status}</Badge></td>
                    <td className="px-3 py-3">{job.attempts}/{job.max_attempts}</td>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(job.completed_at)}</td>
                    <td className="max-w-[320px] px-3 py-3 text-xs text-[var(--text-secondary)]"><div className="line-clamp-3" title={job.last_error ?? ''}>{job.last_error || '—'}</div></td>
                    <td className="px-3 py-3"><div className="flex gap-2">{job.status === 'FAILED' ? <Button size="sm" variant="secondary" disabled={!!busy || !csrf} onClick={() => mutateJob(job.id, 'retry')}>{busy === `retry:${job.id}` ? 'Queuing…' : 'Retry'}</Button> : null}{['DONE', 'FAILED'].includes(job.status) ? <Button size="sm" variant="ghost" disabled={!!busy || !csrf} onClick={() => mutateJob(job.id, 'clear')}>{busy === `clear:${job.id}` ? 'Clearing…' : 'Clear'}</Button> : null}</div></td>
                  </tr>
                ))}
                {!jobs.length ? <tr><td colSpan={9} className="px-4 py-10 text-center text-[var(--text-secondary)]">No print jobs match the current filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
