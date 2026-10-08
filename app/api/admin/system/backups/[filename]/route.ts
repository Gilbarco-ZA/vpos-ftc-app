import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import { deleteOlderBackup, resolveBackupFile } from '@/src/platform/maintenance/system-backups'
import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { createAuditLog } from '@/src/shared/audit/log'
import { defineGetRoute, defineMutationRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ filename: string }>({
  roles: ['administrator'],
  handler: async (_req, { params }) => {
    const filePath = await resolveBackupFile(String(params.filename || ''))
    const filename = path.basename(filePath)
    const contentType = filename.endsWith('.zip')
      ? 'application/zip'
      : 'application/octet-stream'

    return new Response(
      Readable.toWeb(
        createReadStream(/*turbopackIgnore: true*/ filePath),
      ) as ReadableStream<Uint8Array>,
      {
        headers: {
          'content-type': contentType,
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control': 'private, no-store',
        },
      },
    )
  },
})

 
export const DELETE = defineMutationRoute<
  { confirmation?: string; csrf_token?: string },
  { filename: string }
>({
  roles: ['administrator'],
  handler: async (_req, { params, body, user }) => {
    const filename = String(params.filename || '')
    if (body?.confirmation !== `DELETE ${filename}`) {
      throw badRequestError(`Type DELETE ${filename} to confirm.`)
    }
    const deleted = await deleteOlderBackup(filename)
    await createAuditLog({
      stationId: user.stationId,
      userId: user.id,
      action: 'SYSTEM_BACKUP_DELETED',
      entityType: 'system_backup',
      entityId: filename,
      metadata: { filename, kind: deleted.kind, sizeBytes: deleted.sizeBytes },
    }).catch(() => undefined)
    return ok({ deleted })
  },
})
