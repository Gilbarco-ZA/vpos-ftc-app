import { fail, ok } from '@/src/platform/web/api/response'
import { systemConfigSchema } from '@/src/shared/config/schema'

import { saveStationConfigRepo } from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

import type { StationConfigInput } from './deviceConfigTypes'

export async function saveAdminStationConfig(
  stationId: string,
  username: string,
  body: StationConfigInput,
) {
  if (!body?.config_json) return fail('config_json required', 400)

  const parsed = systemConfigSchema.safeParse(body.config_json)
  if (!parsed.success) {
    return fail(
      `Invalid config_json: ${parsed.error.issues?.[0]?.message ?? 'schema mismatch'}`,
      400,
    )
  }

  await saveStationConfigRepo({
    stationId,
    configJson: parsed.data as Record<string, unknown>,
    updatedBy: username,
  })

  return ok({ success: true })
}
