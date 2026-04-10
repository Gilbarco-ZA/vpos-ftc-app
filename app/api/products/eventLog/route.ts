import type { SessionUser } from '@/src/shared/types'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { getProductEventLogViaProxy } from '@/src/shared/proxy/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async (req: Request) => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager'])
    if (!user) {
      return await serverError('User not found')
    }
    const { searchParams } = new URL(req.url)
    const query = Object.fromEntries(searchParams.entries())
    const res = await getProductEventLogViaProxy(user.stationId, query)
    const data = res.data
    if (!res.ok || data?.error === true) {
      return fail(
        data?.message || data?.error?.message || 'Failed to fetch event log',
        data?.responseCode === '1002' ? 404 : res.status,
        undefined,
        { details: data },
      )
    }

    return ok(data ?? null, { status: res.status })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
