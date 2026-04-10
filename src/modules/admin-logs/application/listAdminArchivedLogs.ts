import { ok } from '@/src/platform/web/api/response'
import { parseConsoleRange } from '@/src/shared/admin-logs/range'
import { listLogs } from '@/src/shared/logs/service'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function listAdminArchivedLogs(stationId: string, url: string) {
  const { start, end } = parseConsoleRange(url)
  const data = await listLogs(
    requireNonEmptyString(stationId, 'stationId'),
    'archive',
    start,
    end,
  )
  return ok(data)
}
