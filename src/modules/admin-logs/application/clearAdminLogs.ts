import { fail, ok } from '@/src/platform/web/api/response'
import { clearLogs } from '@/src/shared/logs/service'

import { resolveAdminLogType } from './logTypes'

export async function clearAdminLogs(
  stationId: string,
  body: Record<string, any>,
) {
  const filenames = Array.isArray(body?.filenames)
    ? body.filenames
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean)
    : []
  if (!filenames.length) return fail('filenames is required', 400)

  const type = resolveAdminLogType(String(body?.type || null), 'live')
  const cleared = await clearLogs(stationId, type, filenames)
  return ok({ cleared })
}
