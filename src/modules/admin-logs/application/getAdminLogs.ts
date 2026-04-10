import { ok } from '@/src/platform/web/api/response'
import { listLogs } from '@/src/shared/logs/service'

import { resolveAdminLogType } from './logTypes'

export async function getAdminLogs(stationId: string, url: string) {
  const { searchParams } = new URL(url)
  const type = resolveAdminLogType(searchParams.get('type'))
  const end = new Date()
  const start =
    type === 'live' ? new Date(end.getTime() - 24 * 60 * 60 * 1000) : undefined
  const data = await listLogs(stationId, type, start, end)
  return ok(data)
}
