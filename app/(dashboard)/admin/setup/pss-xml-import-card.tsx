'use client'

import { useEffect, useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeAsync } from '@/src/shared/utils/safeAsync'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type PssXmlStatus = {
  enabled: boolean
  inPath: string | null
  outPath: string | null
  pollMs: number
  lastImportAt: string | null
  lastImportChecksum: string | null
  lastImportError: string | null
  lastExportAt: string | null
  lastExportError: string | null
  parsedSummary: {
    grades: number
    tanks: number
    fuellingPoints: number
  } | null
}

type ImportResult = {
  checksum?: string
  importedProducts?: number
  importedTanks?: number
  importedPumps?: number
}

export default function PssXmlImportCard(props: {
  onImported?: () => void | Promise<void>
}) {
  const [status, setStatus] = useState<PssXmlStatus | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(
    null,
  )

  const loadStatus = async () => {
    setError(null)
    const res = await fetch('/api/admin/integrations/pss-xml', {
      cache: 'no-store',
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j?.error?.message || j?.error || `HTTP ${res.status}`)
      return
    }
    const data = j?.data ?? j
    setStatus(data as any)
  }

  useEffect(() => {
    safeAsync(loadStatus(), 'pssXmlImport.loadStatus')
  }, [])

  const canUpload = useMemo(() => {
    if (!file) return false
    if (busy) return false
    return true
  }, [file, busy])

  const upload = async () => {
    if (!file || busy) return

    setBusy(true)
    setError(null)
    setNotice(null)
    setLastImportResult(null)
    try {
      const fd = new FormData()
      fd.append('action', 'upload_xml')
      fd.append('file', file)

      const res = await fetch('/api/admin/integrations/pss-xml', {
        method: 'POST',
        body: fd,
      })

      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(j?.error?.message || j?.error || `HTTP ${res.status}`)
      }

      const data = j?.data ?? j
      const r = (data?.result ?? null) as any

      setLastImportResult({
        checksum: r?.checksum,
        importedProducts: r?.importedProducts,
        importedTanks: r?.importedTanks,
        importedPumps: r?.importedPumps,
      })

      setNotice(
        `Imported from ${file.name}: products=${r?.importedProducts ?? 0}, tanks=${r?.importedTanks ?? 0}, pumps=${r?.importedPumps ?? 0}`,
      )

      await loadStatus()

      // Notify any mounted setup/config screens (eg. Tank Grades / Tank setup)
      // that their data should be reloaded after a successful import.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pss-xml-imported'))
      }

      await props.onImported?.()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const lastImportLabel = useMemo(() => {
    if (!status?.lastImportAt) return '—'
    try {
      return new Date(status.lastImportAt).toLocaleString()
    } catch {
      return status.lastImportAt
    }
  }, [status?.lastImportAt])

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            0a) Import PSS config.xml (optional)
          </h2>
          <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
            Upload a PSS{' '}
            <code className="rounded bg-[var(--surface-hover)] px-1">
              config.xml
            </code>{' '}
            to seed Products, Tanks and Pump/Nozzle mappings. This is useful for
            remote locations where the PSS drop folder is not accessible.
          </p>
        </div>

        <div className="rounded-xl border bg-[var(--surface-muted)] p-3 text-xs">
          <div>
            <b>Polling sync:</b> {status?.enabled ? 'enabled' : 'disabled'}
          </div>
          <div>
            <b>In path:</b> {status?.inPath ?? '—'}
          </div>
          <div>
            <b>Out path:</b> {status?.outPath ?? '—'}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-[var(--surface-muted)] p-3">
          <div className="text-sm font-semibold">Last imported</div>
          <div className="text-sm">
            <b>At:</b> {lastImportLabel}
          </div>
          <div className="text-sm">
            <b>Checksum:</b> {status?.lastImportChecksum ?? '—'}
          </div>
          <div className="text-sm">
            <b>Summary:</b>{' '}
            {status?.parsedSummary
              ? `grades=${status.parsedSummary.grades}, tanks=${status.parsedSummary.tanks}, fuellingPoints=${status.parsedSummary.fuellingPoints}`
              : '—'}
          </div>
          {status?.lastImportError ? (
            <Alert variant={STATUS_VARIANT.ERROR}>
              <b>Import error:</b> {status.lastImportError}
            </Alert>
          ) : null}

          {lastImportResult ? (
            <div className="rounded-lg border bg-[var(--surface-card)] p-2 text-sm">
              <div>
                <b>Just imported:</b> products=
                {lastImportResult.importedProducts ?? 0}, tanks=
                {lastImportResult.importedTanks ?? 0}, pumps=
                {lastImportResult.importedPumps ?? 0}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border bg-[var(--surface-muted)] p-3">
          <div className="text-sm font-semibold">Upload</div>

          <Input
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setFile(f)
              setError(null)
              setNotice(null)
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={upload} disabled={!canUpload}>
              {busy ? 'Uploading…' : 'Upload & Import'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => loadStatus()}
              disabled={busy}
            >
              Refresh status
            </Button>
          </div>

          {notice ? (
            <Alert variant={STATUS_VARIANT.SUCCESS}>{notice}</Alert>
          ) : null}

          {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}

          <div className="text-xs text-[var(--text-secondary)]">
            Note: The uploaded XML becomes the baseline used for PSS XML
            exports. Export will only patch existing fuelling points in that
            baseline.
          </div>
        </div>
      </div>
    </Card>
  )
}
