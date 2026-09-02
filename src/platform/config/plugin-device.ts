import {
  snapshotDeviceConfigVersion,
  snapshotPluginConfigVersion,
} from '@/src/platform/config/config-version-history'
import { configJsonEquals } from '@/src/platform/config/config-version-policy'
import { query, queryAll, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

export type PluginConfig = {
  stationId: string
  processType: string
  pluginName: string
  enabled: boolean
  configJson: any
}

export type DeviceConfig = {
  stationId: string
  deviceType: string
  deviceKey: string
  enabled: boolean
  configJson: any
}

export async function listPluginConfigs(stationId: string) {
  return await queryAll<any>(
    `SELECT station_id, process_type, plugin_name, enabled, config_json, created_at, updated_at
     FROM plugin_configs
     WHERE station_id = $1
     ORDER BY process_type, plugin_name`,
    [stationId],
  )
}

export async function upsertPluginConfig(args: {
  stationId: string
  processType: string
  pluginName: string
  enabled: boolean
  configJson: any
  schemaVersion?: number
  createdBy?: string | null
}) {
  const schemaVersion = args.schemaVersion ?? 1
  const nextConfig = args.configJson ?? {}
  const current = await queryOne<{ enabled: boolean; config_json: unknown }>(
    `SELECT enabled, config_json
       FROM plugin_configs
      WHERE station_id = $1 AND process_type = $2 AND plugin_name = $3`,
    [args.stationId, args.processType, args.pluginName],
  )
  if (
    current?.enabled === args.enabled &&
    configJsonEquals(current.config_json, nextConfig)
  ) {
    return
  }

  await query(
    `INSERT INTO plugin_configs (id, station_id, process_type, plugin_name, enabled, config_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (station_id, process_type, plugin_name)
     DO UPDATE SET enabled = EXCLUDED.enabled,
                   config_json = EXCLUDED.config_json,
                   updated_at = NOW()`,
    [
      uuidv4(),
      args.stationId,
      args.processType,
      args.pluginName,
      args.enabled,
      nextConfig,
    ],
  )

  if (!current || !configJsonEquals(current.config_json, nextConfig)) {
    await snapshotPluginConfigVersion({
      stationId: args.stationId,
      processType: args.processType,
      pluginName: args.pluginName,
      schemaVersion,
      configJson: nextConfig,
      createdBy: args.createdBy ?? null,
    })
  }
}

export async function listDeviceConfigs(stationId: string) {
  return await queryAll<any>(
    `SELECT station_id, device_type, device_key, enabled, config_json, created_at, updated_at
     FROM device_configs
     WHERE station_id = $1
     ORDER BY device_type, device_key`,
    [stationId],
  )
}

export async function upsertDeviceConfig(args: {
  stationId: string
  deviceType: string
  deviceKey: string
  enabled: boolean
  configJson: any
  schemaVersion?: number
  createdBy?: string | null
}) {
  const schemaVersion = args.schemaVersion ?? 1
  const nextConfig = args.configJson ?? {}
  const current = await queryOne<{ enabled: boolean; config_json: unknown }>(
    `SELECT enabled, config_json
       FROM device_configs
      WHERE station_id = $1 AND device_type = $2 AND device_key = $3`,
    [args.stationId, args.deviceType, args.deviceKey],
  )
  if (
    current?.enabled === args.enabled &&
    configJsonEquals(current.config_json, nextConfig)
  ) {
    return
  }

  await query(
    `INSERT INTO device_configs (id, station_id, device_type, device_key, enabled, config_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (station_id, device_type, device_key)
     DO UPDATE SET enabled = EXCLUDED.enabled,
                   config_json = EXCLUDED.config_json,
                   updated_at = NOW()`,
    [
      uuidv4(),
      args.stationId,
      args.deviceType,
      args.deviceKey,
      args.enabled,
      nextConfig,
    ],
  )

  if (!current || !configJsonEquals(current.config_json, nextConfig)) {
    await snapshotDeviceConfigVersion({
      stationId: args.stationId,
      deviceType: args.deviceType,
      deviceKey: args.deviceKey,
      schemaVersion,
      configJson: nextConfig,
      createdBy: args.createdBy ?? null,
    })
  }
}
