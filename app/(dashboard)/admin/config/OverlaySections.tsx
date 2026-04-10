'use client'

import { pretty } from '@/src/modules/admin-config/presentation/config-editor'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type OverlaySummary = {
  key: string
  label: string
  enabled: boolean
}

export function IntegrationsSummary({
  pluginSummary,
  deviceSummary,
}: {
  pluginSummary: OverlaySummary[]
  deviceSummary: OverlaySummary[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations summary</CardTitle>
        <p className="text-xs text-[var(--text-muted)]">
          High-level view of connected plugins and devices. Detailed editing is
          available in Advanced mode.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!pluginSummary.length && !deviceSummary.length ? (
          <div className="rounded-xl border bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
            No integrations configured yet. Pump controllers, fiscal devices,
            and other integrations will appear here once added in Advanced mode.
          </div>
        ) : (
          <>
            {pluginSummary.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                  Plugins
                </h3>
                <ul className="mt-2 space-y-1">
                  {pluginSummary.map((p) => (
                    <li
                      key={p.key}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5"
                    >
                      <span>{p.label}</span>
                      <span
                        className={`text-xs ${
                          p.enabled
                            ? 'text-green-600'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {deviceSummary.length > 0 && (
              <div className={pluginSummary.length ? 'mt-3 border-t pt-3' : ''}>
                <h3 className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                  Devices
                </h3>
                <ul className="mt-2 space-y-1">
                  {deviceSummary.map((d) => (
                    <li
                      key={d.key}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5"
                    >
                      <span>{d.label}</span>
                      <span
                        className={`text-xs ${
                          d.enabled
                            ? 'text-green-600'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {d.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function PluginOverlaySection({
  csrf,
  pluginForm,
  onPluginFormChange,
  plugins,
  busy,
  onUpsert,
}: {
  csrf: string
  pluginForm: {
    processType: string
    pluginName: string
    enabled: boolean
    configJsonText: string
    schemaVersion: number
  }
  onPluginFormChange: (
    updater: (prev: typeof pluginForm) => typeof pluginForm,
  ) => void
  plugins: any[]
  busy: string | null
  onUpsert: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plugin config overlays</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input
            placeholder="processType (e.g., process.api)"
            value={pluginForm.processType}
            onChange={(e) =>
              onPluginFormChange((p) => ({ ...p, processType: e.target.value }))
            }
          />
          <Input
            placeholder="pluginName"
            value={pluginForm.pluginName}
            onChange={(e) =>
              onPluginFormChange((p) => ({ ...p, pluginName: e.target.value }))
            }
          />
          <Input
            placeholder="schemaVersion"
            value={String(pluginForm.schemaVersion)}
            onChange={(e) =>
              onPluginFormChange((p) => ({
                ...p,
                schemaVersion: Number(e.target.value || 1),
              }))
            }
          />
          <Button
            type="button"
            size="sm"
            variant={pluginForm.enabled ? 'secondary' : 'primary'}
            aria-pressed={pluginForm.enabled}
            onClick={() =>
              onPluginFormChange((p) => ({ ...p, enabled: !p.enabled }))
            }
          >
            {pluginForm.enabled ? 'Enabled' : 'Disabled'}
          </Button>
          <Button
            variant="primary"
            onClick={onUpsert}
            disabled={busy === 'plugin' || !csrf}
            title={!csrf ? 'CSRF token not available yet' : ''}
          >
            Upsert plugin
          </Button>
        </div>
        <Textarea
          className="h-40 font-mono text-xs"
          value={pluginForm.configJsonText}
          onChange={(e) =>
            onPluginFormChange((p) => ({
              ...p,
              configJsonText: e.target.value,
            }))
          }
        />

        {plugins.length === 0 ? (
          <EmptyState
            title="No plugin overlays"
            description="Create a plugin overlay to customize runtime behavior."
          />
        ) : (
          <div className="rounded bg-[var(--surface-muted)] p-3">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">
              Current rows
            </div>
            <pre className="overflow-auto text-xs">{pretty(plugins)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DeviceOverlaySection({
  csrf,
  deviceForm,
  onDeviceFormChange,
  devices,
  busy,
  onUpsert,
}: {
  csrf: string
  deviceForm: {
    deviceType: string
    deviceKey: string
    enabled: boolean
    configJsonText: string
    schemaVersion: number
  }
  onDeviceFormChange: (
    updater: (prev: typeof deviceForm) => typeof deviceForm,
  ) => void
  devices: any[]
  busy: string | null
  onUpsert: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Device config overlays</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input
            placeholder="deviceType (e.g., printer)"
            value={deviceForm.deviceType}
            onChange={(e) =>
              onDeviceFormChange((p) => ({ ...p, deviceType: e.target.value }))
            }
          />
          <Input
            placeholder="deviceKey (e.g., default)"
            value={deviceForm.deviceKey}
            onChange={(e) =>
              onDeviceFormChange((p) => ({ ...p, deviceKey: e.target.value }))
            }
          />
          <Input
            placeholder="schemaVersion"
            value={String(deviceForm.schemaVersion)}
            onChange={(e) =>
              onDeviceFormChange((p) => ({
                ...p,
                schemaVersion: Number(e.target.value || 1),
              }))
            }
          />
          <Button
            type="button"
            size="sm"
            variant={deviceForm.enabled ? 'secondary' : 'primary'}
            aria-pressed={deviceForm.enabled}
            onClick={() =>
              onDeviceFormChange((p) => ({ ...p, enabled: !p.enabled }))
            }
          >
            {deviceForm.enabled ? 'Enabled' : 'Disabled'}
          </Button>
          <Button
            variant="primary"
            onClick={onUpsert}
            disabled={busy === 'device' || !csrf}
          >
            Upsert device
          </Button>
        </div>
        <Textarea
          className="h-40 font-mono text-xs"
          value={deviceForm.configJsonText}
          onChange={(e) =>
            onDeviceFormChange((p) => ({
              ...p,
              configJsonText: e.target.value,
            }))
          }
        />

        {devices.length === 0 ? (
          <EmptyState
            title="No device overlays"
            description="Create a device overlay to customize hardware configuration."
          />
        ) : (
          <div className="rounded bg-[var(--surface-muted)] p-3">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">
              Current rows
            </div>
            <pre className="overflow-auto text-xs">{pretty(devices)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function EffectiveConfigSection({ effective }: { effective: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Effective config</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Runtime view (station + plugin/device overlays + station settings).
        </p>
        <pre className="overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
          {pretty(effective)}
        </pre>
      </CardContent>
    </Card>
  )
}
