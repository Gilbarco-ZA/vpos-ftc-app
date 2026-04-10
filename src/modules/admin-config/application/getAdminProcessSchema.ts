import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import {
  getProcessSchemaRepo,
  getSystemConfigurationRepo,
} from '@/src/modules/admin-config/infrastructure/adminPluginCatalogRepo'

export async function getAdminProcessSchema(args: {
  stationId: string
  name: string
}) {
  const stationId = requireNonEmptyString(args.stationId, 'stationId')
  const name = requireNonEmptyString(args.name, 'name')

  const schema = await getProcessSchemaRepo(name).catch(() => null)
  if (schema) {
    return {
      status: 200,
      body: {
        type: name,
        schema,
        note: 'Catalog-backed JSON schema (seeded from filesystem discovery).',
      },
    }
  }

  const cfg = await getSystemConfigurationRepo(stationId).catch(
    () => null as any,
  )
  const processDefinition = (cfg?.processes?.process ?? {})[name]

  if (!processDefinition) {
    return {
      status: 404,
      body: { error: 'Process not found', name },
    }
  }

  return {
    status: 200,
    body: {
      type: name,
      definition: processDefinition,
      note: 'This endpoint returns the configured process definition (not a Zod schema). Use /api/admin/config/station for schema validation.',
    },
  }
}
