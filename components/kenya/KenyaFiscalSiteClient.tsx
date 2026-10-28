'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'

type SiteConfig = {
  countryCode: string
  tin: string
  branchId: string
  sdcId: string
  nextDocumentNumber: number
  fetchedAt: string
  qrMode?: 'development' | 'production' | 'manual'
  manualQrUrl?: string
}
export function KenyaFiscalSiteClient() {
  const [configuration, setConfiguration] = useState<SiteConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  const [qrMode, setQrMode] = useState<'development' | 'production' | 'manual'>('development')
  const [manualQrUrl, setManualQrUrl] = useState('')
  const [savingQr, setSavingQr] = useState(false)
  function applyConfiguration(value: SiteConfig | null) {
    setConfiguration(value)
    setQrMode(value?.qrMode ?? 'development')
    setManualQrUrl(value?.manualQrUrl ?? '')
  }
  useEffect(() => {
    fetch('/api/admin/kenya-fiscal/site', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data.ok) applyConfiguration(data.configuration); else setError(data.error || 'Unable to load saved configuration') })
      .catch(() => setError('Unable to load saved configuration'))
  }, [])
  async function refresh() {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/kenya-fiscal/site', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: '{}' })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Site configuration fetch failed')
      setConfiguration(data.configuration)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Site configuration fetch failed')
    } finally { setLoading(false) }
  }
  async function saveQr() {
    setSavingQr(true); setError('')
    try {
      const response = await fetch('/api/admin/kenya-fiscal/site', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ mode: qrMode, manualQrUrl }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save QR settings')
      applyConfiguration(data.configuration)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save QR settings')
    } finally { setSavingQr(false) }
  }
  const prefix = qrMode === 'production'
    ? 'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data='
    : qrMode === 'development'
      ? 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data='
      : manualQrUrl
  return <div className="space-y-5">
    <CsrfBootstrap onToken={setCsrfToken} />
    <PageHeader title="Kenya Fiscal Setup" description="Verify the proxy country and save eTIMS site identifiers for offline receipts." />
    <div className="rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">Site configuration</h2>
        <Button type="button" onClick={refresh} disabled={loading || !csrfToken}>{loading ? 'Fetching…' : 'Fetch from proxy & save'}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!configuration ? <p className="text-sm text-muted-foreground">No verified Kenya configuration saved yet.</p> :
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ['Country', configuration.countryCode],
            ['Tax PIN (TIN)', configuration.tin],
            ['Branch ID', configuration.branchId],
            ['SDC / SCU ID', configuration.sdcId],
            ['Next document number (proxy reported)', String(configuration.nextDocumentNumber)],
            ['Last verified', configuration.fetchedAt],
          ].map(([label, val]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-mono break-words">{val}</dd></div>)}
        </dl>}
      {configuration && <div className="space-y-3 border-t border-border pt-4">
        <h3 className="font-semibold">Receipt QR URL</h3>
        <label className="block text-sm">Environment
          <select className="mt-1 w-full rounded-md border border-border bg-background p-2" value={qrMode}
            onChange={event => setQrMode(event.target.value as typeof qrMode)}>
            <option value="development">Development (KRA sandbox)</option>
            <option value="production">Production (KRA live)</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        {qrMode === 'manual' && <label className="block text-sm">Manual QR URL prefix
          <input className="mt-1 w-full rounded-md border border-border bg-background p-2" type="url"
            value={manualQrUrl} onChange={event => setManualQrUrl(event.target.value)} placeholder="https://…" />
        </label>}
        <p className="break-all font-mono text-xs">{prefix || '(No QR URL configured)'}</p>
        <Button type="button" onClick={saveQr} disabled={!csrfToken || savingQr}>
          {savingQr ? 'Saving…' : 'Save QR settings'}
        </Button>
        <p className="text-xs text-muted-foreground">This URL is a configuration prefix, not proof of KRA fiscal approval. Offline receipts must remain marked PENDING FISCALIZATION.</p>
      </div>}
      <p className="text-xs text-muted-foreground">Saved configuration is station-specific. The next document number is informational and is not allocated locally.</p>
    </div>
  </div>
}
