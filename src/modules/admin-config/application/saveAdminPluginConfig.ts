import { toBool, toInt } from '@/src/platform/web/api/request'
import { fail, ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { pluginConfigUpsertSchema } from '@/src/shared/validations'

import {
  listPluginConfigs,
  upsertPluginConfig,
} from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

import type { PluginConfigInput } from './deviceConfigTypes'

export async function saveAdminPluginConfig(
  stationId: string,
  userId: string,
  body: PluginConfigInput,
) {
  const payload = {
    processType: body.processType,
    pluginName: body.pluginName,
    enabled: toBool(body.enabled),
    configJson: body.configJson ?? body.config_json ?? {},
    schemaVersion: toInt(body.schemaVersion) ?? 1,
  }

  const parsed = pluginConfigUpsertSchema.safeParse(payload)
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  await upsertPluginConfig({
    stationId,
    processType: parsed.data.processType,
    pluginName: parsed.data.pluginName,
    enabled: parsed.data.enabled,
    configJson: parsed.data.configJson,
    schemaVersion: parsed.data.schemaVersion,
    createdBy: userId,
  })

  await createAuditLog({
    stationId,
    userId,
    action: 'PLUGIN_CONFIG_UPSERTED',
    entityType: 'plugin_configs',
    metadata: parsed.data,
  }).catch(() => {})

  return ok(await listPluginConfigs(stationId))
}
