import type { JsonObject, StationConfigRow } from '@/src/shared/config/types'

import {
  bootstrapStationConfig as platformBootstrapStationConfig,
  getStationConfig as platformGetStationConfig,
  getSystemConfiguration as platformGetSystemConfiguration,
  importConfigFromJson as platformImportConfigFromJson,
  saveStationConfig as platformSaveStationConfig,
} from '@/src/platform/config/loader'
import {
  ensurePlainObject,
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

export const getStationConfig = async (
  stationId: string,
): Promise<StationConfigRow | null> => {
  return await platformGetStationConfig(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export const saveStationConfig = async (
  stationId: string,
  configJson: JsonObject,
  schemaVersion?: string,
): Promise<void> => {
  await platformSaveStationConfig(
    requireNonEmptyString(stationId, 'stationId'),
    ensurePlainObject<JsonObject>(configJson),
    optionalNonEmptyString(schemaVersion),
  )
}

export const bootstrapStationConfig = async (
  stationId: string,
): Promise<StationConfigRow> => {
  return await platformBootstrapStationConfig(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export const getSystemConfiguration = async (stationId: string) => {
  return await platformGetSystemConfiguration(
    requireNonEmptyString(stationId, 'stationId'),
  )
}

export const importConfigFromJson = async (
  stationId: string,
  configPath: string,
): Promise<StationConfigRow | null> => {
  return await platformImportConfigFromJson(
    requireNonEmptyString(stationId, 'stationId'),
    requireNonEmptyString(configPath, 'configPath'),
  )
}
