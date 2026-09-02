import {
  configJsonEquals,
  hashConfigJson,
} from '@/src/platform/config/config-version-policy'
import { getStationConfig } from '@/src/platform/config/loader'
import { query, queryOne } from '@/src/platform/db/postgres'
import {
  getBrandingSettings,
  updateBrandingSettings,
} from '@/src/shared/branding/settings'
import { listStationConfigDefaults } from '@/src/shared/config/defaults'
import { getEffectiveSystemConfiguration } from '@/src/shared/config/effective'
import { getCurrentStationConfigStatus } from '@/src/shared/config/importStatus'
import {
  listDeviceConfigs,
  listPluginConfigs,
  upsertDeviceConfig,
  upsertPluginConfig,
} from '@/src/shared/config/pluginDevice'
import {
  getStationSettings,
  updateStationSettings,
} from '@/src/shared/settings/station'
import { uuidv4 } from '@/src/shared/utils/uuid'

export {
  listDeviceConfigs,
  listPluginConfigs,
  upsertDeviceConfig,
  upsertPluginConfig,
}

export async function getStationConfigRepo(stationId: string) {
  return await getStationConfig(stationId)
}

export async function saveStationConfigRepo(args: {
  stationId: string
  configJson: Record<string, unknown>
  updatedBy: string
}) {
  await query(`SELECT pg_advisory_lock(hashtext($1))`, [
    `station_config_update:${args.stationId}`,
  ])
  try {
    const current = await queryOne<{
      schema_version: string
      config_json: Record<string, unknown>
    }>(
      `SELECT schema_version, config_json
         FROM station_config
        WHERE station_id = $1`,
      [args.stationId],
    )
    if (current && configJsonEquals(current.config_json, args.configJson)) {
      return
    }

    if (current) {
      const id = uuidv4()
      const configHash = hashConfigJson(current.config_json)
      await query(
        `INSERT INTO station_config_versions
           (id, station_id, schema_version, config_json, config_hash, created_by)
         SELECT $1, $2, $3, $4, $5, $6
          WHERE NOT EXISTS (
            SELECT 1
              FROM (
                SELECT config_hash, config_json
                  FROM station_config_versions
                 WHERE station_id = $2
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
              ) latest
             WHERE latest.config_hash = $5
                OR (latest.config_hash IS NULL AND latest.config_json = $4::jsonb)
          )`,
        [
          id,
          args.stationId,
          current.schema_version,
          current.config_json,
          configHash,
          args.updatedBy,
        ],
      )
    }

    await query(
      `UPDATE station_config
          SET config_json = $2,
              updated_at = NOW()
        WHERE station_id = $1`,
      [args.stationId, args.configJson],
    )
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [
      `station_config_update:${args.stationId}`,
    ])
  }
}

export async function getBrandingSettingsRepo(stationId: string) {
  return await getBrandingSettings(stationId)
}

export async function saveBrandingSettingsRepo(args: {
  stationId: string
  logoPath: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  stationDisplayName?: string | null
  receiptFooterText?: string | null
  receiptHeaderText?: string | null
}) {
  await updateBrandingSettings(args)
}

export async function getStationSettingsRepo(stationId: string) {
  return await getStationSettings(stationId)
}

export async function saveStationSettingsRepo(args: {
  stationId: string
  linkingWindowSeconds?: number | null
  unallocatedHandling?: string | null
  fiscalizationEngine?: string | null
  fiscalizationTransport?: string | null
  autoFiscalizeEnabled?: boolean | null
  autoPrintReceipts?: boolean | null
  syncEnabled?: boolean | null
  syncTime?: string | null
  syncTimezone?: string | null
  moneyDecimals?: number | null
  unitPriceDecimals?: number | null
  volumeDecimals?: number | null
}) {
  await updateStationSettings(args)
}

export async function listStationConfigDefaultsRepo() {
  return await listStationConfigDefaults()
}

export async function getEffectiveSystemConfigurationRepo(stationId: string) {
  return await getEffectiveSystemConfiguration(stationId)
}

export async function getStationConfigStatusRepo(stationId: string) {
  return await getCurrentStationConfigStatus(stationId)
}
