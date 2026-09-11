import { runStationStorageRetention } from '@/src/platform/retention/stationStorageRetention'
import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const result = await runStationStorageRetention(user.stationId, {
      force: true,
    })
    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'STORAGE_RETENTION_RUN_REQUESTED',
      entityType: 'station_storage',
      metadata: {
        enabled: result.enabled,
        dryRun: result.dryRun,
        deleted: result.retention?.deleted ?? 0,
        printTestDeleted: result.printTestJobs.deleted,
      },
    }).catch(() => {})
    return ok(result)
  },
})
