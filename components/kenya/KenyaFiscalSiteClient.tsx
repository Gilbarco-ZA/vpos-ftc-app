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
}
export function KenyaFiscalSiteClient() {
  const [configuration, setConfiguration] = useState<SiteConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  useEffect(() => {
    fetch('/api/admin/kenya-fiscal/site', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (data.ok) setConfiguration(data.configuration); else setError(data.error || 'Unable to load saved configuration') })
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
      <p className="text-xs text-muted-foreground">Saved configuration is station-specific. The next document number is informational and is not allocated locally.</p>
    </div>
  </div>
}
