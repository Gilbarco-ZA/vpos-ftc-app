import type { SessionUser } from '@/src/shared/types'

import { queryOne } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth()
    if (!user) {
      return await serverError('User not found')
    }
    const row = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM station_config WHERE station_id = $1) AS exists`,
      [user.stationId],
    )

    return ok({ hasConfig: Boolean(row?.exists) })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
