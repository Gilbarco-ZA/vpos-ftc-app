import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getVposStatus } from '@/src/modules/vpos/application/getVposStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user }) => {
    const data = await getVposStatus({ stationId: user.stationId })
    return ok(data)
  },
})
