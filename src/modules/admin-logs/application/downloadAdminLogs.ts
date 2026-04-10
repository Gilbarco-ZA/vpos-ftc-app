import type { LogType } from '@/src/shared/logs/service'

import { fail } from '@/src/platform/web/api/response'
import { buildLogsArchiveResponse } from '@/src/shared/logs/archive'

export async function downloadAdminLogs(
  stationId: string,
  body: Record<string, any>,
) {
  const filenames: string[] = Array.isArray(body?.filenames)
    ? body.filenames
    : []
  const type: LogType =
    body?.type === 'archive'
      ? 'archive'
      : body?.type === 'restart'
        ? 'restart'
        : 'live'

  if (!filenames.length) return fail('filenames is required', 400)
  return await buildLogsArchiveResponse(stationId, type, filenames)
}
