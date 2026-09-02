'use client'

import type {
  DeviceRow,
  PrinterConfig,
} from '@/src/modules/admin-config/presentation/printers'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { safeAsync } from '@/src/shared/utils/safeAsync'

import { pretty } from '@/src/modules/admin-config/presentation/config-editor'
import {
  buildPrinterConnectionPayload,
  defaultPrinterConfig,
  normalizeAssignedFpIds,
  normalizeDeviceRow,
  normalizePrinterConfig,
} from '@/src/modules/admin-config/presentation/printers'

import { RetentionSettingsCard } from '@/components/admin/printing/RetentionSettingsCard'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Skeleton } from '@/components/ui/skeleton'

import { PrinterListCard, PrinterSettingsCard } from './printer-sections'

type TestAction = 'connection' | 'receipt' | 'report'

type TestResult = {
  variant: 'success' | 'error' | 'info'
  message: string
} | null

const toPumpIds = (payload: any): number[] => {
  const candidates = [
    ...(Array.isArray(payload?.config?.pumps) ? payload.config.pumps : []),
    ...(Array.isArray(payload?.liveState?.pumps)
      ? payload.liveState.pumps
      : []),
  ]

  return Array.from(
    new Set(
      candidates
        .map((pump: any) => Number(String(pump?.pumpId ?? '').trim()))
        .filter((pumpId) => Number.isFinite(pumpId) && pumpId > 0),
    ),
  ).sort((a, b) => a - b)
}

export default function PrinterConfigPage() {
  const [csrf, setCsrf] = useState('')
  const [rows, setRows] = useState<DeviceRow[]>([])
  const [availablePumpIds, setAvailablePumpIds] = useState<number[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('default')

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult>(null)
  const [isLoading, setIsLoading] = useState(true)

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
      .filter((row) => (row.deviceType ?? '') === 'printer')
      .sort((a, b) => String(a.deviceKey).localeCompare(String(b.deviceKey)))
  }, [rows])

  const selectedRow = useMemo(() => {
    return printers.find((row) => (row.deviceKey ?? '') === selectedKey) ?? null
  }, [printers, selectedKey])

  const selectedAssignmentWarnings = useMemo(() => {
    const currentAssignments = normalizeAssignedFpIds(printer.fpIds)
    if (!currentAssignments.length) return []

    const conflicts: string[] = []
    for (const row of printers) {
      const key = String(row.deviceKey ?? '')
      if (key === selectedKey) continue
      const otherPrinter = normalizePrinterConfig(row.configJson ?? {})
      const overlaps = normalizeAssignedFpIds(otherPrinter.fpIds).filter(
        (pumpId) => currentAssignments.includes(pumpId),
      )
      if (!overlaps.length) continue
      conflicts.push(
        `Pump ${overlaps.join(', ')} is already assigned to ${otherPrinter.name || key}.`,
      )
    }

    return conflicts
  }, [printer.fpIds, printers, selectedKey])

  const loadAll = useCallback(async () => {
    setError(null)
    setNotice(null)
    setIsLoading(true)
    try {
      const [csrfRes, devicesRes, pumpsRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch('/api/admin/config/devices', { cache: 'no-store' }),
        fetch('/api/pumps/state', { cache: 'no-store' }),
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

      const pumpsJson = await safeAsync(pumpsRes.json(), 'printers.loadPumps')
      const pumpPayload = Array.isArray(pumpsJson)
        ? {}
        : (pumpsJson?.data ?? pumpsJson ?? {})
      setAvailablePumpIds(toPumpIds(pumpPayload))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      safeAsync(loadAll(), 'printers.loadAll')
    })
  }, [loadAll])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const row = selectedRow
      if (!row) {
        const defaults = defaultPrinterConfig()
        setEnabled(true)
        setSchemaVersion(1)
        setPrinter(defaults)
        setConfigJsonText(pretty(defaults))
        return
      }

      setEnabled(!!row.enabled)
      setSchemaVersion(Number(row.schemaVersion ?? 1))

      const cfg = normalizePrinterConfig(row.configJson ?? {})
      setPrinter(cfg)
      setConfigJsonText(pretty(cfg))
    })
    return () => {
      cancelled = true
    }
  }, [selectedRow])

  useEffect(() => {
    if (advancedJsonOpen) return
    queueMicrotask(() => setConfigJsonText(pretty(printer)))
  }, [printer, advancedJsonOpen])

  const parsedAdvanced = useMemo(() => {
    try {
      return JSON.parse(configJsonText || '{}')
    } catch {
      return null
    }
  }, [configJsonText])

  const persistPrinter = async (
    deviceKey: string,
    configJson: unknown,
    enabledValue: boolean,
    schemaVersionValue: number,
  ) => {
    const res = await fetch('/api/admin/config/devices', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({
        csrf_token: csrf,
        deviceType: 'printer',
        deviceKey,
        enabled: enabledValue,
        configJson,
        schemaVersion: Number(schemaVersionValue || 1),
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json?.error ?? 'Failed to save printer config')
    }
    return json
  }

  const upsert = async () => {
    setBusy('save')
    setError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const edited = advancedJsonOpen ? parsedAdvanced : printer
      if (!edited) throw new Error('Advanced JSON is invalid')

      const normalized = normalizePrinterConfig(edited)
      const key = String(selectedKey || '').trim() || 'default'
      await persistPrinter(key, normalized, enabled, schemaVersion)

      if (normalized.isDefault) {
        for (const row of printers) {
          const otherKey = String(row.deviceKey ?? '').trim()
          if (!otherKey || otherKey === key) continue
          const otherPrinter = normalizePrinterConfig(row.configJson ?? {})
          if (!otherPrinter.isDefault) continue
          await persistPrinter(
            otherKey,
            { ...otherPrinter, isDefault: false },
            row.enabled !== false,
            Number(row.schemaVersion ?? 1),
          )
        }
      }

      setNotice('Printer config saved')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const runPrinterTest = async (action: TestAction) => {
    const endpoint =
      action === 'connection'
        ? '/api/admin/setup/test-printer-connection'
        : action === 'receipt'
          ? '/api/admin/setup/test-transaction-printout'
          : '/api/admin/setup/test-report-printout'

    setBusy(`test:${action}`)
    setError(null)
    setNotice(null)
    setTestResult(null)

    try {
      const payload = {
        ...buildPrinterConnectionPayload(printer),
        printerKey: String(selectedKey || '').trim() || undefined,
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? json?.message ?? 'Printer test failed')
      }
      setTestResult({
        variant: 'success',
        message:
          action === 'connection'
            ? 'Printer connection test completed.'
            : action === 'receipt'
              ? 'Sample receipt sent to the printer.'
              : 'Sample report sent to the printer.',
      })
    } catch (e: any) {
      setTestResult({
        variant: 'error',
        message: e?.message ?? String(e),
      })
    } finally {
      setBusy(null)
    }
  }

  const addPrinter = () => {
    const base = 'printer'
    const existing = new Set(printers.map((row) => String(row.deviceKey ?? '')))
    let i = 1
    let key = `${base}-${i}`
    while (existing.has(key)) {
      i += 1
      key = `${base}-${i}`
    }

    const defaults = {
      ...defaultPrinterConfig(),
      id: String(i),
      name: `Receipt printer ${i}`,
      isDefault: printers.length === 0,
    }

    setSelectedKey(key)
    setEnabled(true)
    setSchemaVersion(1)
    setPrinter(defaults)
    setConfigJsonText(pretty(defaults))
    setAdvancedJsonOpen(false)
    setTestResult(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Printer configuration"
        description="Set up reusable printer profiles, assign them to pumps, test receipt printing, and manage print/storage retention without production environment access."
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
              {busy === 'save' ? 'Saving…' : 'Save'}
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
          availablePumpIds={availablePumpIds}
          assignmentWarnings={selectedAssignmentWarnings}
          testBusy={
            busy === 'test:connection'
              ? 'connection'
              : busy === 'test:receipt'
                ? 'receipt'
                : busy === 'test:report'
                  ? 'report'
                  : null
          }
          testResult={testResult}
          onEnabledToggle={() => setEnabled((value) => !value)}
          onSchemaVersionChange={setSchemaVersion}
          onAdvancedToggle={() => setAdvancedJsonOpen((value) => !value)}
          onRunTest={runPrinterTest}
          configJsonText={configJsonText}
          parsedAdvanced={parsedAdvanced}
          onConfigJsonChange={setConfigJsonText}
        />
      </div>

      <RetentionSettingsCard />
    </div>
  )
}
