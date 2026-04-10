import { toBool, toInt } from '@/src/platform/web/api/request'
import { fail } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { stationSettingsSchema } from '@/src/shared/validations'

import {
  getStationSettingsRepo,
  saveStationSettingsRepo,
} from '@/src/modules/admin-config/infrastructure/adminConfigRepo'

export async function saveAdminSettings(args: {
  stationId: string
  userId: string
  body: Record<string, any>
}) {
  const payload = {
    linkingWindowSeconds: toInt(args.body.linkingWindowSeconds),
    unallocatedHandling: args.body.unallocatedHandling,
    fiscalizationEngine: args.body.fiscalizationEngine,
    autoFiscalizeEnabled: toBool(args.body.autoFiscalizeEnabled),
    syncEnabled: toBool(args.body.syncEnabled),
    syncTime: args.body.syncTime,
    syncTimezone: args.body.syncTimezone,
    moneyDecimals: toInt(args.body.moneyDecimals),
    unitPriceDecimals: toInt(args.body.unitPriceDecimals),
    volumeDecimals: toInt(args.body.volumeDecimals),
  }

  const parsed = stationSettingsSchema.safeParse(payload)
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  await saveStationSettingsRepo({
    stationId: args.stationId,
    ...parsed.data,
  })

  await createAuditLog({
    stationId: args.stationId,
    userId: args.userId,
    action: 'SETTINGS_UPDATED',
    entityType: 'station_settings',
    metadata: parsed.data,
  }).catch(() => {})

  return await getStationSettingsRepo(args.stationId)
}
