import { query } from '@/src/platform/db/postgres'

export async function snapshotPluginConfigVersion(args: {
  stationId: string
  processType: string
  pluginName: string
  schemaVersion?: number
  configJson: unknown
  createdBy?: string | null
}) {
  const schemaVersion = args.schemaVersion ?? 1

  await query(
    `
    INSERT INTO plugin_config_versions
      (station_id, process_type, plugin_name, schema_version, config_json, created_by)
    VALUES
      ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      args.stationId,
      args.processType,
      args.pluginName,
      schemaVersion,
      JSON.stringify(args.configJson ?? {}),
      args.createdBy ?? null,
    ],
  )
}

export async function snapshotDeviceConfigVersion(args: {
  stationId: string
  deviceType: string
  deviceKey: string
  schemaVersion?: number
  configJson: unknown
  createdBy?: string | null
}) {
  const schemaVersion = args.schemaVersion ?? 1

  await query(
    `
    INSERT INTO device_config_versions
      (station_id, device_type, device_key, schema_version, config_json, created_by)
    VALUES
      ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      args.stationId,
      args.deviceType,
      args.deviceKey,
      schemaVersion,
      JSON.stringify(args.configJson ?? {}),
      args.createdBy ?? null,
    ],
  )
}
