import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { restartVposSupervisor } from '@/src/modules/vpos/application/restartVposSupervisor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) => {
    const data = await restartVposSupervisor({ stationId: user.stationId })
    return ok(data)
  },
})
