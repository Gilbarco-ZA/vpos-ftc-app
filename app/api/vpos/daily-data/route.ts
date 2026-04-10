import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { readVposDailyData } from '@/src/modules/vpos/application/getVposDailyData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user }) => {
    const data = await readVposDailyData({ stationId: user.stationId })
    return ok(data)
  },
})
