import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { recomputeDailyTotals } from '@/src/modules/transactions/application/recomputeDailyTotals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const body = await req.json().catch((): Record<string, any> => ({}))
    const businessDate = body?.businessDate
      ? String(body.businessDate)
      : undefined
    const totals = await recomputeDailyTotals(user.stationId, businessDate)

    return ok(totals)
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
