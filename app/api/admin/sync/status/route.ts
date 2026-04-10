import type { SessionUser } from '@/src/shared/types'

import { queryOne as pgOne } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator'])
    if (!user) {
      return await serverError('User not found')
    }
    const row = await pgOne<any>(
      `SELECT * FROM sync_state WHERE station_id = $1`,
      [user.stationId],
    )
    return ok(row)
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
