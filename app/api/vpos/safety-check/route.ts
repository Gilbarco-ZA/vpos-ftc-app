import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { readVposSafetyCheck } from '@/src/modules/vpos/application/getVposSafetyCheck'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const data = await readVposSafetyCheck({ stationId: user.stationId })
    return ok(data)
  },
})
