import { toBool, toInt } from '@/src/platform/web/api/request'
import { fail, ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { deviceConfigUpsertSchema } from '@/src/shared/validations'

import {
  listDeviceConfigs,
  upsertDeviceConfig,
} from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

import type { DeviceConfigInput } from './deviceConfigTypes'

export async function saveAdminDeviceConfig(
  stationId: string,
  userId: string,
  body: DeviceConfigInput,
) {
  const payload = {
    deviceType: body.deviceType,
    deviceKey: body.deviceKey,
    enabled: toBool(body.enabled),
    configJson: body.configJson ?? body.config_json ?? {},
    schemaVersion: toInt(body.schemaVersion) ?? 1,
  }

  const parsed = deviceConfigUpsertSchema.safeParse(payload)
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  await upsertDeviceConfig({
    stationId,
    deviceType: parsed.data.deviceType,
    deviceKey: parsed.data.deviceKey,
    enabled: parsed.data.enabled,
    configJson: parsed.data.configJson,
    schemaVersion: parsed.data.schemaVersion,
    createdBy: userId,
  })

  await createAuditLog({
    stationId,
    userId,
    action: 'DEVICE_CONFIG_UPSERTED',
    entityType: 'device_configs',
    metadata: parsed.data,
  }).catch(() => {})

  return ok(await listDeviceConfigs(stationId))
}
