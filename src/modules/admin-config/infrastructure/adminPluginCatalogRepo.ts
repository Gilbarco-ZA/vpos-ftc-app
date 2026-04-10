import { getSystemConfiguration } from '@/src/shared/config/loader'
import { listPluginConfigs } from '@/src/shared/config/pluginDevice'

import {
  getPluginSchemas,
  getProcessSchema,
  listCatalogPlugins,
} from '@/src/modules/admin-config/infrastructure/pluginCatalogStore'

export async function getSystemConfigurationRepo(stationId: string) {
  return await getSystemConfiguration(stationId)
}

export async function listPluginConfigsRepo(stationId: string) {
  return await listPluginConfigs(stationId)
}

export async function listCatalogPluginsRepo() {
  return await listCatalogPlugins()
}

export async function getPluginSchemasRepo(pluginName: string) {
  return await getPluginSchemas(pluginName)
}

export async function getProcessSchemaRepo(processType: string) {
  return await getProcessSchema(processType)
}
