import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { listTransactionNotifications } from '@/src/modules/transactions/application/queries/list-transaction-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['tenant', 'manager', 'administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const { searchParams } = new URL(req.url)
    const sinceIdRaw = String(searchParams.get('sinceId') || '0')
    const sinceId = Math.max(0, Number.parseInt(sinceIdRaw, 10) || 0)
    const limitRaw = Number.parseInt(
      String(searchParams.get('limit') || '20'),
      10,
    )
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(limitRaw) || 20))

    const items = await listTransactionNotifications({
      stationId: user.stationId,
      sinceId,
      limit,
    })

    return ok({ items })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
