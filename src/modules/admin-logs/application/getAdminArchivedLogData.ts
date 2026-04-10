import { parseConsoleRange } from '@/src/shared/console/range'
import { listLogs } from '@/src/shared/logs/service'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function getAdminArchivedLogData(stationId: string, url: string) {
  const { start, end } = parseConsoleRange(url)
  return await listLogs(
    requireNonEmptyString(stationId, 'stationId'),
    'archive',
    start,
    end,
  )
}
