import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminArchivedLogData } from '@/src/modules/admin-logs/application/getAdminArchivedLogData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Console compatibility alias for /api/logs/archive (vpos-console)
export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const data = await getAdminArchivedLogData(user.stationId, req.url)
    return ok({ data })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
