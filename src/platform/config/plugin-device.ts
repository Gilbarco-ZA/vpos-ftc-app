import { query, queryAll } from '@/src/platform/db/postgres'
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
      args.configJson ?? {},
    ],
  )

  await query(
    `INSERT INTO plugin_config_versions (station_id, process_type, plugin_name, schema_version, config_json, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      args.stationId,
      args.processType,
      args.pluginName,
      schemaVersion,
      args.configJson ?? {},
      args.createdBy ?? null,
    ],
  )
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
      args.configJson ?? {},
    ],
  )

  await query(
    `INSERT INTO device_config_versions (station_id, device_type, device_key, schema_version, config_json, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      args.stationId,
      args.deviceType,
      args.deviceKey,
      schemaVersion,
      args.configJson ?? {},
      args.createdBy ?? null,
    ],
  )
}
