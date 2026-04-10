import { fail } from '@/src/platform/web/api/response'
import { readStationLog } from '@/src/shared/logs/service'
import { tailLines } from '@/src/shared/logs/tail'

import {
  assertSafeAdminLogFilename,
  resolveAdminLogLines,
  resolveAdminLogType,
  sanitizeAdminLogFilename,
} from './logTypes'

export async function viewAdminLog(stationId: string, url: string) {
  const { searchParams } = new URL(url)
  const type = resolveAdminLogType(searchParams.get('type'))
  const filename = sanitizeAdminLogFilename(searchParams.get('filename'))
  const format = String(searchParams.get('format') || 'text').toLowerCase()
  const lines = resolveAdminLogLines(searchParams.get('lines'))

  try {
    assertSafeAdminLogFilename(filename)
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : 'invalid filename',
      filename ? 400 : 400,
    )
  }

  const row = await readStationLog(stationId, type, filename)
  if (!row) return fail('not found', 404)

  const content = tailLines(row.data ?? '', lines)
  if (format === 'json') {
    return Response.json({
      success: true,
      data: { filename: row.filename, type, lines, content },
    })
  }

  return new Response(content, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-log-filename': row.filename,
      'x-log-type': type,
    },
  })
}
