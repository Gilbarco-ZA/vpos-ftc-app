import type { SessionUser } from '@/src/shared/types'

import { fail, ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'
import { getProductStatusViaProxy } from '@/src/shared/proxy/client'

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
    const res = await getProductStatusViaProxy(user.stationId, query)
    if (!res.ok) {
      return fail(
        (res.data as any)?.error?.message || 'Failed to fetch status',
        res.status,
        undefined,
        { details: res.data },
      )
    }
    return ok(res.data ?? null, { status: res.status })
  } catch (err) {
    return await serverError(err, { req, stationId: user?.stationId })
  }
}
