import type {
  DeviceConfig,
  PluginConfig,
} from '@/src/platform/config/plugin-device'

import {
  listDeviceConfigs as platformListDeviceConfigs,
  listPluginConfigs as platformListPluginConfigs,
  upsertDeviceConfig as platformUpsertDeviceConfig,
  upsertPluginConfig as platformUpsertPluginConfig,
} from '@/src/platform/config/plugin-device'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

// Device and plugin rows are shared contracts, but persistence stays in platform.

export type { DeviceConfig, PluginConfig }

export async function listPluginConfigs(stationId: string) {
  return await platformListPluginConfigs(
    requireNonEmptyString(stationId, 'stationId'),
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
  return await platformUpsertPluginConfig({
    ...args,
    stationId: requireNonEmptyString(args.stationId, 'stationId'),
    processType: requireNonEmptyString(args.processType, 'processType'),
    pluginName: requireNonEmptyString(args.pluginName, 'pluginName'),
  })
}

export async function listDeviceConfigs(stationId: string) {
  return await platformListDeviceConfigs(
    requireNonEmptyString(stationId, 'stationId'),
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
  return await platformUpsertDeviceConfig({
    ...args,
    stationId: requireNonEmptyString(args.stationId, 'stationId'),
    deviceType: requireNonEmptyString(args.deviceType, 'deviceType'),
    deviceKey: requireNonEmptyString(args.deviceKey, 'deviceKey'),
  })
}
