import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { reloadVposSupervisorConfig } from '@/src/modules/vpos/application/restartVposSupervisor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Record<string, never>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) => {
    const data = await reloadVposSupervisorConfig({ stationId: user.stationId })
    return ok(data)
  },
})
