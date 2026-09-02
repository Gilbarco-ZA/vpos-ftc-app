import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import { resolveBackupFile } from '@/src/platform/maintenance/system-backups'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

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
