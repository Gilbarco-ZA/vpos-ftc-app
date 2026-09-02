import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'
import { createAuditLog } from '@/src/shared/audit/log'
import { runStationStorageRetention } from '@/src/platform/retention/stationStorageRetention'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const result = await runStationStorageRetention(user.stationId, { force: true })
    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'storage_retention',
      metadata: {
        scope: 'storage_retention_manual_run',
        enabled: result.enabled,
        dryRun: result.dryRun,
        deleted: result.retention?.deleted ?? 0,
        printTestDeleted: result.printTestJobs.deleted,
      },
    }).catch(() => {})
    return ok(result)
  },
})
