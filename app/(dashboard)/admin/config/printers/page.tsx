'use client'

import type {
  DeviceRow,
  PrinterConfig,
} from '@/src/modules/admin-config/presentation/printers'
import { useEffect, useMemo, useState } from 'react'

import { safeAsync } from '@/src/shared/utils/safeAsync'

import { pretty } from '@/src/modules/admin-config/presentation/config-editor'
import {
  defaultPrinterConfig,
  migrateOldPrinterShape,
  normalizeDeviceRow,
} from '@/src/modules/admin-config/presentation/printers'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Skeleton } from '@/components/ui/skeleton'

import { PrinterListCard, PrinterSettingsCard } from './printer-sections'

export default function PrinterConfigPage() {
  const [csrf, setCsrf] = useState('')
  const [rows, setRows] = useState<DeviceRow[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('default')

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // form
  const [enabled, setEnabled] = useState(true)
  const [schemaVersion, setSchemaVersion] = useState<number>(1)
  const [printer, setPrinter] = useState<PrinterConfig>(defaultPrinterConfig())
  const [advancedJsonOpen, setAdvancedJsonOpen] = useState(false)
  const [configJsonText, setConfigJsonText] = useState(
    pretty(defaultPrinterConfig()),
  )

  const printers = useMemo(() => {
    return rows
      .map(normalizeDeviceRow)
      .filter((r) => (r.deviceType ?? '') === 'printer')
      .sort((a, b) => String(a.deviceKey).localeCompare(String(b.deviceKey)))
  }, [rows])

  const selectedRow = useMemo(() => {
    return printers.find((p) => (p.deviceKey ?? '') === selectedKey) ?? null
  }, [printers, selectedKey])

  const loadAll = async () => {
    setError(null)
    setNotice(null)
    setIsLoading(true)
    try {
      const [csrfRes, devicesRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch('/api/admin/config/devices', { cache: 'no-store' }),
      ])

      const csrfJson = await csrfRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrf(csrfJson.token)

      const devicesJson = await safeAsync(
        devicesRes.json(),
        'printers.loadDevices',
      )
      const list = Array.isArray(devicesJson)
        ? devicesJson
        : (devicesJson?.data ?? [])
      setRows(list)

      // if selected doesn’t exist yet, keep “default” but don’t crash
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setIsLoading(false)
    }
  }

  // load once
  useEffect(() => {
    safeAsync(loadAll(), 'printers.loadAll')
  }, [])

  // when selection changes, populate form from row (or defaults)
  useEffect(() => {
    const row = selectedRow
    if (!row) {
      setEnabled(true)
      setSchemaVersion(1)
      const d = defaultPrinterConfig()
      setPrinter(d)
      setConfigJsonText(pretty(d))
      return
    }

    setEnabled(!!row.enabled)
    setSchemaVersion(Number(row.schemaVersion ?? 1))

    const raw = (row.configJson ?? {}) as PrinterConfig
    const cfg = migrateOldPrinterShape(raw)
    const merged = { ...defaultPrinterConfig(), ...cfg }
    setPrinter(merged)
    setConfigJsonText(pretty(cfg))
  }, [selectedRow])

  // keep JSON in sync when not in advanced mode
  useEffect(() => {
    if (advancedJsonOpen) return
    setConfigJsonText(pretty(printer))
  }, [printer, advancedJsonOpen])

  const parsedAdvanced = useMemo(() => {
    try {
      return JSON.parse(configJsonText || '{}')
    } catch {
      return null
    }
  }, [configJsonText])

  const upsert = async () => {
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const cfg = advancedJsonOpen ? parsedAdvanced : printer
      if (!cfg) throw new Error('Advanced JSON is invalid')

      const res = await fetch('/api/admin/config/devices', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          csrf_token: csrf,
          deviceType: 'printer',
          deviceKey: selectedKey || 'default',
          enabled,
          configJson: cfg,
          schemaVersion: Number(schemaVersion || 1),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? 'Failed to save printer config')

      setNotice('Printer config saved')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const addPrinter = () => {
    // pick a new key safely
    const base = 'printer'
    const existing = new Set(printers.map((p) => String(p.deviceKey ?? '')))
    let i = 1
    let key = `${base}-${i}`
    while (existing.has(key)) {
      i += 1
      key = `${base}-${i}`
    }
    setSelectedKey(key)
    setEnabled(true)
    setSchemaVersion(1)
    const d = defaultPrinterConfig()
    setPrinter(d)
    setConfigJsonText(pretty(d))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Printer configuration"
        description="Manage printer device overlays using a structured form with an advanced JSON escape hatch."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => loadAll()}
              disabled={!!busy}
            >
              Refresh
            </Button>
            <Button variant="secondary" onClick={addPrinter} disabled={!!busy}>
              Add printer
            </Button>
            <Button
              variant="primary"
              onClick={upsert}
              disabled={busy === 'save' || !csrf}
            >
              Save
            </Button>
          </div>
        }
      />

      {error && (
        <ErrorDetails
          title="Unable to load printer configuration"
          message="Check your connection and try again."
          error={error}
        />
      )}
      {notice && (
        <Card>
          <CardContent>
            <div className="text-sm text-emerald-700">{notice}</div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PrinterListCard
          printers={printers}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onSelectedKeyChange={setSelectedKey}
        />

        <PrinterSettingsCard
          enabled={enabled}
          schemaVersion={schemaVersion}
          advancedJsonOpen={advancedJsonOpen}
          printer={printer}
          setPrinter={setPrinter}
          onEnabledToggle={() => setEnabled((v) => !v)}
          onSchemaVersionChange={setSchemaVersion}
          onAdvancedToggle={() => setAdvancedJsonOpen((v) => !v)}
          configJsonText={configJsonText}
          parsedAdvanced={parsedAdvanced}
          onConfigJsonChange={setConfigJsonText}
        />
      </div>
    </div>
  )
}
