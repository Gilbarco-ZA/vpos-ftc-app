import {
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import {
  getPluginSchemasRepo,
  getSystemConfigurationRepo,
  listPluginConfigsRepo,
} from '@/src/modules/admin-config/infrastructure/adminPluginCatalogRepo'

export async function getAdminPluginSchema(args: {
  stationId: string
  name: string
  processType?: string | null
}) {
  const stationId = requireNonEmptyString(args.stationId, 'stationId')
  const name = requireNonEmptyString(args.name, 'name')
  const processType = optionalNonEmptyString(args.processType ?? undefined)

  const schemas = await getPluginSchemasRepo(name).catch(() => null)
  if (schemas) {
    return {
      status: 200,
      body: {
        name,
        processType: processType || undefined,
        schema: processType ? (schemas[processType] ?? null) : undefined,
        schemas: processType ? undefined : schemas,
        note: 'Catalog-backed JSON schema (seeded from filesystem discovery).',
      },
    }
  }

  const dbPlugins = await listPluginConfigsRepo(stationId).catch(() => [])
  const matching = (dbPlugins as any[]).filter(
    (plugin) => String(plugin.plugin_name ?? plugin.pluginName) === name,
  )

  const cfg = await getSystemConfigurationRepo(stationId).catch(
    () => null as any,
  )
  const processMap: Record<string, any> = cfg?.processes?.process ?? {}

  const referenced: any[] = []
  for (const [currentProcessType, definition] of Object.entries(processMap)) {
    for (const plugin of ((definition as any)?.plugins ?? []) as any[]) {
      if (String(plugin?.name ?? '') === name) {
        referenced.push({ processType: currentProcessType, definition: plugin })
      }
    }
  }

  if (!matching.length && !referenced.length) {
    return {
      status: 404,
      body: { error: 'Plugin not found', name },
    }
  }

  return {
    status: 200,
    body: {
      name,
      dbRecords: matching.map((plugin) => ({
        processType: plugin.process_type ?? plugin.processType,
        enabled: plugin.enabled,
        configJson: plugin.config_json ?? plugin.configJson,
      })),
      referencedInStationConfig: referenced,
      note: 'Catalog not present for this plugin. Returning config records/definitions instead.',
    },
  }
}
