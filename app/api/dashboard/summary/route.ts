import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { parseConsoleRange } from '@/src/shared/console/range'

import { getDashboardSummary } from '@/src/modules/reports/application/getDashboardSummary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { start, end } = parseConsoleRange(req.url)

    return ok(
      await getDashboardSummary({
        stationId: user.stationId,
        start,
        end,
      }),
    )
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
