'use client'

import type { Json } from '@/src/modules/admin-config/presentation/config-editor'
import { useEffect, useMemo, useState } from 'react'

import { safeAsync } from '@/src/shared/utils/safeAsync'

import { pretty } from '@/src/modules/admin-config/presentation/config-editor'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'

import {
  DeviceOverlaySection,
  EffectiveConfigSection,
  IntegrationsSummary,
  PluginOverlaySection,
} from './OverlaySections'
import { StationConfigSection } from './StationConfigSection'

export default function AdminConfigPage() {
  const [csrf, setCsrf] = useState('')
  const [stationConfig, setStationConfig] = useState<Json>(null)
  const [plugins, setPlugins] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [effective, setEffective] = useState<Json>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [stationConfigText, setStationConfigText] = useState('')
  const [stationConfigObj, setStationConfigObj] = useState<any>(null)
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic')

  const [pluginForm, setPluginForm] = useState({
    processType: 'process.api',
    pluginName: 'supervisor',
    enabled: true,
    configJsonText: '{}',
    schemaVersion: 1,
  })

  const [deviceForm, setDeviceForm] = useState({
    deviceType: 'printer',
    deviceKey: 'default',
    enabled: true,
    configJsonText: '{}',
    schemaVersion: 1,
  })

  const pluginSummary = useMemo(
    () =>
      (plugins ?? []).map((p: any, index: number) => ({
        key:
          p.id ??
          p.name ??
          `${p.processType ?? 'process'}:${p.pluginName ?? index}`,
        label:
          [p.processType, p.pluginName].filter(Boolean).join(' â€“ ') ||
          'Plugin',
        enabled: p.enabled !== false,
      })),
    [plugins],
  )

  const deviceSummary = useMemo(
    () =>
      (devices ?? []).map((d: any, index: number) => ({
        key: d.id ?? d.deviceId ?? `device-${index}`,
        label: d.name ?? d.deviceType ?? 'Device',
        enabled: d.enabled !== false,
      })),
    [devices],
  )

  const stationConfigParsed = useMemo(() => {
    try {
      return JSON.parse(stationConfigText)
    } catch {
      return null
    }
  }, [stationConfigText])

  const loadAll = async () => {
    setError(null)
    setNotice(null)
    setIsLoading(true)
    try {
      const [csrfRes, stationRes, pluginsRes, devicesRes, effRes] =
        await Promise.all([
          fetch('/api/security/csrf', { cache: 'no-store' }),
          fetch('/api/admin/config/station', { cache: 'no-store' }),
          fetch('/api/admin/config/plugins', { cache: 'no-store' }),
          fetch('/api/admin/config/devices', { cache: 'no-store' }),
          fetch('/api/admin/config/effective', { cache: 'no-store' }),
        ])

      const csrfJson = await csrfRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrf(csrfJson.token)

      const stationJson = await safeAsync(
        stationRes.json(),
        'configPage.stationJson',
      )
      const pluginsJson = await safeAsync(
        pluginsRes.json(),
        'configPage.pluginsJson',
      )
      const devicesJson = await safeAsync(
        devicesRes.json(),
        'configPage.devicesJson',
      )
      const effJson = await safeAsync(effRes.json(), 'configPage.effJson')

      setStationConfig(stationJson)
      setPlugins(
        Array.isArray(pluginsJson) ? pluginsJson : (pluginsJson?.data ?? []),
      )
      setDevices(
        Array.isArray(devicesJson) ? devicesJson : (devicesJson?.data ?? []),
      )
      setEffective(effJson)

      const cfg = stationJson?.configJson ?? stationJson?.config_json
      if (cfg) {
        setStationConfigObj(cfg)
        setStationConfigText(pretty(cfg))
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    safeAsync(loadAll(), 'configPage.loadAll')
  }, [])

  useEffect(() => {
    if (mode === 'basic') {
      setShowAdvancedJson(false)
    }
  }, [mode])

  const saveStation = async () => {
    setBusy('station')
    setError(null)
    setNotice(null)
    try {
      const payload = showAdvancedJson ? stationConfigParsed : stationConfigObj
      if (!payload) throw new Error('Station config is invalid')
      const res = await fetch('/api/admin/config/station', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config_json: payload }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? 'Failed to save station config')
      setNotice('Station config saved')
      await loadAll()
    } finally {
      setBusy(null)
    }
  }

  const upsertPlugin = async () => {
    setBusy('plugin')
    setError(null)
    setNotice(null)
    try {
      const cfg = JSON.parse(pluginForm.configJsonText || '{}')
      const res = await fetch('/api/admin/config/plugins', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          csrf_token: csrf,
          processType: pluginForm.processType,
          pluginName: pluginForm.pluginName,
          enabled: pluginForm.enabled,
          configJson: cfg,
          schemaVersion: Number(pluginForm.schemaVersion || 1),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? 'Failed to upsert plugin config')
      setNotice('Plugin config saved')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const upsertDevice = async () => {
    setBusy('device')
    setError(null)
    setNotice(null)
    try {
      const cfg = JSON.parse(deviceForm.configJsonText || '{}')
      const res = await fetch('/api/admin/config/devices', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          csrf_token: csrf,
          deviceType: deviceForm.deviceType,
          deviceKey: deviceForm.deviceKey,
          enabled: deviceForm.enabled,
          configJson: cfg,
          schemaVersion: Number(deviceForm.schemaVersion || 1),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? 'Failed to upsert device config')
      setNotice('Device config saved')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const reloadConfig = async () => {
    setBusy('reload')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/supervisor/reload-config', {
        method: 'POST',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? 'Reload failed')
      setNotice('Reload requested (workers will reinitialize)')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuration"
        description="Basic station and printer setup for operators. Advanced overlays are available for integrators."
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={mode}
              onValueChange={(value) => setMode(value as 'basic' | 'advanced')}
              options={[
                { label: 'Simple', value: 'basic' },
                { label: 'Advanced', value: 'advanced' },
              ]}
            />
            <Button
              variant="secondary"
              onClick={() => loadAll()}
              disabled={!!busy}
            >
              Refresh
            </Button>
            <Button variant="primary" onClick={reloadConfig} disabled={!!busy}>
              Reload Config
            </Button>
          </div>
        }
      />

      {error && (
        <ErrorDetails
          title="Unable to load configuration"
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
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ) : null}

      <StationConfigSection
        mode={mode}
        showAdvancedJson={showAdvancedJson}
        onToggleAdvancedJson={() => setShowAdvancedJson((v) => !v)}
        stationConfigText={stationConfigText}
        onStationConfigTextChange={setStationConfigText}
        stationConfigObj={stationConfigObj}
        onStationConfigObjChange={setStationConfigObj}
        busy={busy}
        onSave={saveStation}
      />

      {mode === 'basic' && (
        <IntegrationsSummary
          pluginSummary={pluginSummary}
          deviceSummary={deviceSummary}
        />
      )}

      <PluginOverlaySection
        csrf={csrf}
        pluginForm={pluginForm}
        onPluginFormChange={setPluginForm}
        plugins={plugins}
        busy={busy}
        onUpsert={upsertPlugin}
      />

      <DeviceOverlaySection
        csrf={csrf}
        deviceForm={deviceForm}
        onDeviceFormChange={setDeviceForm}
        devices={devices}
        busy={busy}
        onUpsert={upsertDevice}
      />

      <EffectiveConfigSection effective={effective} />
    </div>
  )
}
