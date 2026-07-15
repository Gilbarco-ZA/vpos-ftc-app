import type { SystemConfiguration } from '@/src/shared/config/schema'

import { deepMerge } from '@/src/platform/config/deep-merge'
import { getStationConfigDefaults } from '@/src/platform/config/defaults'
import {
  bootstrapStationConfig,
  getStationConfig,
} from '@/src/platform/config/loader'
import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { systemConfigSchema } from '@/src/shared/config/schema'
import { safeAsync } from '@/src/shared/utils/safeAsync'

type PluginConfigRow = {
  process_type: string
  plugin_name: string
  enabled: boolean
  config_json: any
}

type DeviceConfigRow = {
  device_type: string
  device_key: string
  enabled: boolean
  config_json: any
}

function upsertPlugin(
  cfg: SystemConfiguration,
  processType: string,
  pluginName: string,
  enabled: boolean,
  configJson: any,
) {
  const p = cfg.processes?.process?.[processType]
  if (!p) return

  const plugins = Array.isArray(p.plugins) ? p.plugins : []
  const idx = plugins.findIndex((x: any) => x?.name === pluginName)

  const next = {
    name: pluginName,
    enabled: enabled !== false,
    config: configJson ?? {},
  }

  if (idx >= 0) plugins[idx] = { ...plugins[idx], ...next }
  else plugins.push(next)

  p.plugins = plugins
}

export async function getEffectiveSystemConfiguration(
  stationId: string,
): Promise<SystemConfiguration> {
  let station = await getStationConfig(stationId)
  if (!station) {
    await bootstrapStationConfig(stationId)
    station = await getStationConfig(stationId)
  }
  if (!station) {
    throw new Error(`Station config not found for station_id: ${stationId}`)
  }

  const stationCfg = station.configJson as SystemConfiguration
  const country = String((stationCfg as any)?.config?.country || 'US')
    .trim()
    .toUpperCase()
  const defaults = await getStationConfigDefaults(
    country,
    station.schemaVersion || 'vpos-app-1',
  )

  const base = (
    defaults?.configJson
      ? deepMerge(defaults.configJson as any, stationCfg as any)
      : stationCfg
  ) as SystemConfiguration

  const pluginRows = await queryAll<PluginConfigRow>(
    `
    SELECT process_type, plugin_name, enabled, config_json
    FROM plugin_configs
    WHERE station_id = $1
    ORDER BY process_type, plugin_name
    `,
    [stationId],
  )

  for (const r of pluginRows) {
    upsertPlugin(base, r.process_type, r.plugin_name, r.enabled, r.config_json)
  }

  const deviceRows = await queryAll<DeviceConfigRow>(
    `
    SELECT device_type, device_key, enabled, config_json
    FROM device_configs
    WHERE station_id = $1
    ORDER BY device_type, device_key
    `,
    [stationId],
  )

  const devices: Record<string, any> = {}
  for (const r of deviceRows) {
    if (!devices[r.device_type]) devices[r.device_type] = {}
    devices[r.device_type][r.device_key] = {
      enabled: r.enabled !== false,
      config: r.config_json ?? {},
    }
  }

  ;(base as any).devices = devices

  const validated = systemConfigSchema.parse(base) as SystemConfiguration

  const ss = await safeAsync(
    queryOne<any>(
      `SELECT linking_window_seconds,
            unallocated_handling,
            fiscalization_engine,
            fiscalization_transport,
            auto_fiscalize_enabled,
            auto_print_receipts,
            sync_enabled,
            sync_time,
            sync_timezone,
            proxy_url,
            proxy_base_path,
            vat_rate_tz,
            vat_rate_ke,
            vat_rate_default
     FROM station_settings
     WHERE station_id = $1`,
      [stationId],
    ),
    'effective.stationSettings',
  )

  ;(validated as any).stationSettings = ss
    ? {
        linkingWindowSeconds: ss.linking_window_seconds,
        unallocatedHandling: ss.unallocated_handling,
        fiscalizationEngine: ss.fiscalization_engine,
        fiscalizationTransport: ss.fiscalization_transport,
        autoFiscalizeEnabled: ss.auto_fiscalize_enabled,
        autoPrintReceipts: ss.auto_print_receipts,
        syncEnabled: ss.sync_enabled,
        syncTime: ss.sync_time,
        syncTimezone: ss.sync_timezone,
        proxyUrl: ss.proxy_url,
        proxyBasePath: ss.proxy_base_path,
        vatRateTz: ss.vat_rate_tz != null ? Number(ss.vat_rate_tz) : null,
        vatRateKe: ss.vat_rate_ke != null ? Number(ss.vat_rate_ke) : null,
        vatRateDefault:
          ss.vat_rate_default != null ? Number(ss.vat_rate_default) : null,
      }
    : null

  return validated
}
