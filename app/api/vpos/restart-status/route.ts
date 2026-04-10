import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { readVposRestartStatus } from '@/src/modules/vpos/application/getVposRestartStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const data = await readVposRestartStatus({ stationId: user.stationId })
    return ok(data)
  },
})
