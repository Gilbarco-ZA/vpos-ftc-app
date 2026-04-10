import { PassThrough, Readable } from 'stream'
import type { LogType } from '@/src/shared/logs/service'
import archiver from 'archiver'

import { readStationLog } from '@/src/shared/logs/service'

export async function buildLogsArchiveResponse(
  stationId: string,
  type: LogType,
  filenames: string[],
) {
  const archive = archiver('zip', { zlib: { level: 9 } })
  const pass = new PassThrough()
  archive.on('error', (e) => pass.destroy(e as any))
  archive.pipe(pass)

  for (const filename of filenames) {
    const row = await readStationLog(stationId, type, filename)
    if (!row) continue
    archive.append(row.data ?? '', { name: filename })
  }
  await archive.finalize()

  const webStream = (Readable as any).toWeb(pass)
  return new Response(webStream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${type}-logs.zip"`,
    },
  })
}
