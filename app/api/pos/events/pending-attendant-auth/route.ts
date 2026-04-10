import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listPendingAttendantAuth } from '@/src/modules/pos/application/listPendingAttendantAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    return ok(
      await listPendingAttendantAuth({
        stationId: user.stationId,
      }),
    )
  },
})
