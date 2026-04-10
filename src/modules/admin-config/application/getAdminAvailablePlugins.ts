import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import {
  getSystemConfigurationRepo,
  listCatalogPluginsRepo,
  listPluginConfigsRepo,
} from '@/src/modules/admin-config/infrastructure/adminPluginCatalogRepo'

export async function getAdminAvailablePlugins(stationId: string) {
  const scopedStationId = requireNonEmptyString(stationId, 'stationId')
  const cfg = await getSystemConfigurationRepo(scopedStationId).catch(
    () => null as any,
  )
  const processMap: Record<string, any> = cfg?.processes?.process ?? {}

  const dbPlugins = await listPluginConfigsRepo(scopedStationId).catch(() => [])
  const catalog = await listCatalogPluginsRepo().catch(() => [])

  const pluginSet = new Map<
    string,
    {
      name: string
      processTypes: string[]
      enabledInConfig?: boolean
      metadata?: any
      hasSchema?: boolean
    }
  >()

  for (const entry of catalog as any[]) {
    const name = String(entry.plugin_name)
    const schemas = entry.schemas_json ?? {}
    const processTypes = Object.keys(schemas)
    pluginSet.set(name, {
      name,
      processTypes,
      metadata: entry.metadata_json ?? {},
      hasSchema: processTypes.length > 0,
    })
  }

  for (const plugin of dbPlugins as any[]) {
    const key = String(plugin.plugin_name ?? plugin.pluginName)
    const processType = String(plugin.process_type ?? plugin.processType)
    const existing = pluginSet.get(key) ?? { name: key, processTypes: [] }
    if (!existing.processTypes.includes(processType)) {
      existing.processTypes.push(processType)
    }
    pluginSet.set(key, existing)
  }

  for (const [processType, definition] of Object.entries(processMap)) {
    const plugins = (definition as any)?.plugins ?? []
    for (const plugin of plugins) {
      const name = String(plugin?.name ?? '')
      if (!name) continue
      const existing = pluginSet.get(name) ?? { name, processTypes: [] }
      if (!existing.processTypes.includes(processType)) {
        existing.processTypes.push(processType)
      }
      existing.enabledInConfig = plugin?.enabled !== false
      pluginSet.set(name, existing)
    }
  }

  return Array.from(pluginSet.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}
