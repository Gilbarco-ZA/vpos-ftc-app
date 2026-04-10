import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listAdminForecourtLiveEvents } from '@/src/modules/forecourt/application/listAdminForecourtLiveEvents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    return ok(
      await listAdminForecourtLiveEvents(user.stationId, url.searchParams),
    )
  },
})
