import { hashConfigJson } from '@/src/platform/config/config-version-policy'
import { query } from '@/src/platform/db/postgres'

const latestVersionDiffersSql = (ownerWhere: string) => `NOT EXISTS (
  SELECT 1
    FROM (
      SELECT config_hash, config_json
        FROM %TABLE%
       WHERE ${ownerWhere}
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    ) latest
   WHERE latest.config_hash = $HASH_PARAM
      OR (latest.config_hash IS NULL AND latest.config_json = $JSON_PARAM::jsonb)
)`

export async function snapshotPluginConfigVersion(args: {
  stationId: string
  processType: string
  pluginName: string
  schemaVersion?: number
  configJson: unknown
  createdBy?: string | null
}) {
  const schemaVersion = args.schemaVersion ?? 1
  const configHash = hashConfigJson(args.configJson ?? {})
  const guard = latestVersionDiffersSql(
    'station_id = $1 AND process_type = $2 AND plugin_name = $3',
  )
    .replace('%TABLE%', 'plugin_config_versions')
    .replace('$HASH_PARAM', '$6')
    .replace('$JSON_PARAM', '$5')

  await query(
    `INSERT INTO plugin_config_versions
      (station_id, process_type, plugin_name, schema_version, config_json, config_hash, created_by)
     SELECT $1, $2, $3, $4, $5::jsonb, $6, $7
      WHERE ${guard}`,
    [
      args.stationId,
      args.processType,
      args.pluginName,
      schemaVersion,
      JSON.stringify(args.configJson ?? {}),
      configHash,
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
  const configHash = hashConfigJson(args.configJson ?? {})
  const guard = latestVersionDiffersSql(
    'station_id = $1 AND device_type = $2 AND device_key = $3',
  )
    .replace('%TABLE%', 'device_config_versions')
    .replace('$HASH_PARAM', '$6')
    .replace('$JSON_PARAM', '$5')

  await query(
    `INSERT INTO device_config_versions
      (station_id, device_type, device_key, schema_version, config_json, config_hash, created_by)
     SELECT $1, $2, $3, $4, $5::jsonb, $6, $7
      WHERE ${guard}`,
    [
      args.stationId,
      args.deviceType,
      args.deviceKey,
      schemaVersion,
      JSON.stringify(args.configJson ?? {}),
      configHash,
      args.createdBy ?? null,
    ],
  )
}
