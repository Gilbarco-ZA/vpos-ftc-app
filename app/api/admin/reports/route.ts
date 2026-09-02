import type { SessionUser } from '@/src/shared/types'

import { ok, serverError } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { listAdminReports } from '@/src/modules/reports/application/listAdminReports'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  let user: SessionUser | null = null
  try {
    user = await requireAuth(['administrator', 'manager']) // Consider adding: 'tenant'

    const rows = await listAdminReports(user.stationId)

    return ok({ data: rows })
  } catch (err) {
    return await serverError(err, { stationId: user?.stationId })
  }
}
