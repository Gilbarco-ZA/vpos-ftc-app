import { fail, ok } from '@/src/platform/web/api/response'
import { readStationLog } from '@/src/shared/logs/service'
import { tailLines } from '@/src/shared/logs/tail'

import {
  resolveAdminLogLines,
  resolveAdminLogType,
  sanitizeAdminLogFilename,
} from './logTypes'

export async function getAdminLogContent(stationId: string, url: string) {
  const { searchParams } = new URL(url)
  const type = resolveAdminLogType(searchParams.get('type'))
  const filename = sanitizeAdminLogFilename(searchParams.get('filename'))
  if (!filename) return fail('filename is required', 400)

  const lines = resolveAdminLogLines(searchParams.get('lines'), 200, 5000)
  const row = await readStationLog(stationId, type, filename)
  if (!row) return fail('not found', 404)

  const content = tailLines(row.data ?? '', lines)
  return ok({
    filename: row.filename,
    type,
    lines,
    content,
  })
}
