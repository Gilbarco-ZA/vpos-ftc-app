import { resolveApplicationRestartScripts, scheduleApplicationRestart } from '@/src/platform/maintenance/service-restart'
import { restoreDatabaseBackup } from '@/src/platform/maintenance/system-backups'
import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  { confirmation?: string; csrf_token?: string },
  { filename: string }
>({
  roles: ['administrator'],
  handler: async (_req, { body, params, user }) => {
    const filename = String(params.filename || '')
    if (body?.confirmation !== `RESTORE ${filename}`) {
      throw badRequestError(`Type RESTORE ${filename} to confirm.`)
    }
    const restartScripts = await resolveApplicationRestartScripts()
    const result = await restoreDatabaseBackup(filename)
    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'DATABASE_BACKUP_RESTORED',
      entityType: 'system_backup',
      entityId: filename,
      metadata: { restoredBackup: filename, safetyBackup: result.safetyBackup.filename },
    }).catch(() => undefined)
    scheduleApplicationRestart(restartScripts, 750)
    return ok({ ...result, accepted: true, message: 'Database restored. Application restart requested.' })
  },
})
