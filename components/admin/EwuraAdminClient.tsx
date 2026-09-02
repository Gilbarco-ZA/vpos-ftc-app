'use client'

import { useCallback, useEffect, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  })
  const data = await safeAsync(res.json(), 'ewuraAdmin.parseJson')
  if (!res.ok)
    throw new Error(
      data?.error || data?.message || `Request failed: ${res.status}`,
    )
  return data
}

export const EwuraAdminClient = () => {
  const [configJson, setConfigJson] = useState<string>('{}')
  const [registrationJson, setRegistrationJson] = useState<string>('{}')
  const [registrationStatus, setRegistrationStatus] =
    useState<string>('UNKNOWN')
  const [registeredAt, setRegisteredAt] = useState<string>('')

  const [tx, setTx] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])

  const [patchType, setPatchType] = useState<'transactions' | 'reports'>(
    'transactions',
  )
  const [patchId, setPatchId] = useState<string>('')
  const [patchStatus, setPatchStatus] = useState<string>('')
  const [patchRef, setPatchRef] = useState<string>('')
  const [patchDate, setPatchDate] = useState<string>('') // reports only
  const [patchPayload, setPatchPayload] = useState<string>('')

  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPatchTypeChange = (value: string) => {
    if (value === 'transactions' || value === 'reports') {
      setPatchType(value)
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cfg, reg, txRes, repRes] = await Promise.all([
        jsonFetch('/api/admin/ewura/config', { cache: 'no-store' as any }),
        jsonFetch('/api/admin/ewura/registration', {
          cache: 'no-store' as any,
        }),
        jsonFetch('/api/admin/ewura/transactions?limit=50', {
          cache: 'no-store' as any,
        }),
        jsonFetch('/api/admin/ewura/reports?limit=50', {
          cache: 'no-store' as any,
        }),
      ])

      setConfigJson(
        JSON.stringify(
          cfg?.data?.config_json ?? cfg?.data?.configJson ?? {},
          null,
          2,
        ),
      )
      setRegistrationJson(
        JSON.stringify(
          reg?.data?.registration_json ?? reg?.data?.registrationJson ?? {},
          null,
          2,
        ),
      )
      setRegistrationStatus(String(reg?.data?.status ?? 'UNKNOWN'))
      setRegisteredAt(
        reg?.data?.registered_at ? String(reg.data.registered_at) : '',
      )

      setTx(txRes?.data ?? [])
      setReports(repRes?.data ?? [])
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      refresh().catch((e) => setError(e?.message ?? String(e)))
    })
  }, [refresh])

  const saveConfig = async () => {
    setBusy('save-config')
    setError(null)
    try {
      await jsonFetch('/api/admin/ewura/config', {
        method: 'POST',
        body: JSON.stringify({ configJson: JSON.parse(configJson || '{}') }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const saveRegistration = async () => {
    setBusy('save-registration')
    setError(null)
    try {
      await jsonFetch('/api/admin/ewura/registration', {
        method: 'POST',
        body: JSON.stringify({
          status: registrationStatus,
          registeredAt: registeredAt || null,
          registrationJson: JSON.parse(registrationJson || '{}'),
        }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const patchItem = async () => {
    setBusy('patch')
    setError(null)
    try {
      const body: any = {
        id: patchId,
        status: patchStatus || null,
        ewuraReference: patchRef || null,
      }
      if (patchType === 'reports') body.reportDate = patchDate || null
      if (patchPayload.trim()) body.payloadJson = JSON.parse(patchPayload)

      await jsonFetch(`/api/admin/ewura/${patchType}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const showInitialLoading = loading && !hasLoaded

  return (
    <div className="space-y-6">
      {error && <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative rounded border bg-[var(--surface-card)] p-4">
          {loading && hasLoaded ? (
            <LoadingOverlay label="Refreshing EWURA configuration…" />
          ) : null}
          <h2 className="mb-2 font-semibold">EWURA Config</h2>
          {showInitialLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <Textarea
              className="h-64 w-full rounded border p-2 font-mono text-xs"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
            />
          )}
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              disabled={busy !== null}
              onClick={saveConfig}
            >
              {busy === 'save-config' ? 'Saving…' : 'Save Config'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => refresh()}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="relative rounded border bg-[var(--surface-card)] p-4">
          {loading && hasLoaded ? (
            <LoadingOverlay label="Refreshing EWURA registration…" />
          ) : null}
          <h2 className="mb-2 font-semibold">EWURA Registration</h2>

          {showInitialLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <div className="mb-2 grid gap-2 md:grid-cols-2">
                <FormField label="Status">
                  <Input
                    value={registrationStatus}
                    onChange={(e) => setRegistrationStatus(e.target.value)}
                  />
                </FormField>
                <FormField label="Registered At (ISO)">
                  <Input
                    value={registeredAt}
                    onChange={(e) => setRegisteredAt(e.target.value)}
                    placeholder="2026-02-03T12:34:56.000Z"
                  />
                </FormField>
              </div>

              <Textarea
                className="h-48 w-full rounded border p-2 font-mono text-xs"
                value={registrationJson}
                onChange={(e) => setRegistrationJson(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  disabled={busy !== null}
                  onClick={saveRegistration}
                >
                  {busy === 'save-registration'
                    ? 'Saving…'
                    : 'Save Registration'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative rounded border bg-[var(--surface-card)] p-4">
        {loading && hasLoaded ? (
          <LoadingOverlay label="Refreshing EWURA records…" />
        ) : null}
        <h2 className="mb-2 font-semibold">Patch Transaction / Report</h2>

        <div className="grid gap-2 md:grid-cols-5">
          <FormField label="Type">
            <Select
              value={patchType}
              onChange={(e) => onPatchTypeChange(e.target.value)}
            >
              <option value="transactions">transactions</option>
              <option value="reports">reports</option>
            </Select>
          </FormField>

          <FormField label="ID" className="md:col-span-2">
            <Input
              value={patchId}
              onChange={(e) => setPatchId(e.target.value)}
              placeholder="uuid"
            />
          </FormField>

          <FormField label="Status">
            <Input
              value={patchStatus}
              onChange={(e) => setPatchStatus(e.target.value)}
              placeholder="NEW / SENT / FAILED / ..."
            />
          </FormField>

          <FormField label="Reference">
            <Input
              value={patchRef}
              onChange={(e) => setPatchRef(e.target.value)}
              placeholder="EWURA ref"
            />
          </FormField>

          {patchType === 'reports' && (
            <FormField label="Report Date" className="md:col-span-2">
              <Input
                value={patchDate}
                onChange={(e) => setPatchDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </FormField>
          )}
        </div>

        <FormField label="Payload JSON (optional)" className="mt-2">
          <Textarea
            className="h-32 w-full rounded border p-2 font-mono text-xs"
            value={patchPayload}
            onChange={(e) => setPatchPayload(e.target.value)}
            placeholder="{ ... }"
          />
        </FormField>

        <div className="mt-2 flex gap-2">
          <Button
            variant="primary"
            disabled={busy !== null || !patchId}
            onClick={patchItem}
          >
            {busy === 'patch' ? 'Patching…' : 'Apply Patch'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative rounded border bg-[var(--surface-card)] p-4">
          {loading && hasLoaded ? (
            <LoadingOverlay label="Refreshing EWURA configuration…" />
          ) : null}
          <h2 className="mb-2 font-semibold">Recent Transactions</h2>
          <pre className="h-96 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(tx, null, 2)}
          </pre>
        </div>

        <div className="rounded border bg-[var(--surface-card)] p-4">
          <h2 className="mb-2 font-semibold">Recent Reports</h2>
          <pre className="h-96 overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(reports, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
