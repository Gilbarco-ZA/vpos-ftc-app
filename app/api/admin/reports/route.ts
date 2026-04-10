import type { SessionUser } from '@/src/shared/types'

import { queryAll } from '@/src/platform/db/postgres'
import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager']) // Consider adding: 'tenant'

    const rows = await queryAll<any>(
      `
      SELECT id, report_date_time, report_type, status, created_at, updated_at
      FROM reports
      WHERE station_id = $1
      ORDER BY report_date_time DESC
      LIMIT 200
      `,
      [user?.stationId],
    )

    return ok({ data: rows })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
