import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { getStationConfigStatus } from '@/src/modules/admin-config/application/getStationConfigStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth()
    if (!user) {
      return await serverError('User not found')
    }
    return ok(await getStationConfigStatus(user.stationId))
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
