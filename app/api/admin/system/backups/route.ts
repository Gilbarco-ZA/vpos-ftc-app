import {
  createDatabaseBackup,
  createFullBackup,
  listBackupFiles,
} from '@/src/platform/maintenance/system-backups'
import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async () => ok({ backups: await listBackupFiles() }),
})

export const POST = defineMutationRoute<{
  kind?: 'database' | 'full'
  csrf_token?: string
}>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const kind = String(body?.kind || '')
      .trim()
      .toLowerCase()
    if (kind !== 'database' && kind !== 'full') {
      throw badRequestError('Backup kind must be database or full.')
    }

    const backup =
      kind === 'full' ? await createFullBackup() : await createDatabaseBackup()

    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action:
        kind === 'full'
          ? 'FULL_SYSTEM_BACKUP_CREATED'
          : 'DATABASE_BACKUP_CREATED',
      entityType: 'system_backup',
      entityId: backup.filename,
      metadata: {
        filename: backup.filename,
        sizeBytes: backup.sizeBytes,
        kind,
      },
    }).catch(() => undefined)

    return ok({ backup })
  },
})
