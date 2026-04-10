import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { readVposPosStatus } from '@/src/modules/vpos/application/getVposPosStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const data = await readVposPosStatus({ stationId: user.stationId })
    return ok(data)
  },
})
