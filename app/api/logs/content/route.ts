import type { SessionUser } from '@/src/shared/types'

import { serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getAdminLogContent } from '@/src/modules/admin-logs/application/getAdminLogContent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Console-friendly log content endpoint.
 * GET /api/logs/content?type=live|archive|restart&filename=...&lines=200
 */
export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    return await getAdminLogContent(user.stationId, req.url)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
