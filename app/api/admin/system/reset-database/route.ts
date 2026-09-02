import {
  resolveApplicationRestartScripts,
  scheduleApplicationRestart,
} from '@/src/platform/maintenance/service-restart'
import {
  createDatabaseBackup,
  dropApplicationDatabase,
} from '@/src/platform/maintenance/system-backups'
import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESET_CONFIRMATION = 'DROP VPOS DATABASE'

export const POST = defineMutationRoute<{
  confirmation?: string
  csrf_token?: string
}>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    if (String(body?.confirmation || '').trim() !== RESET_CONFIRMATION) {
      throw badRequestError(`Type ${RESET_CONFIRMATION} to confirm.`)
    }

    // Verify that the service can be restarted before making any destructive
    // database changes.
    const restartScripts = await resolveApplicationRestartScripts()
    const backup = await createDatabaseBackup({ preReset: true })

    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'APPLICATION_DATABASE_RESET_REQUESTED',
      entityType: 'database',
      metadata: {
        confirmation: RESET_CONFIRMATION,
        preResetBackup: backup.filename,
      },
    })

    const dropped = await dropApplicationDatabase()
    scheduleApplicationRestart(restartScripts, 750)

    return ok({
      accepted: true,
      backup,
      databaseName: dropped.databaseName,
      message:
        'Database dropped. VPOS FTC will restart and recreate an empty database.',
    })
  },
})
