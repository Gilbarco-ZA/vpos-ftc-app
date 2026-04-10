import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { syncTankVolumes } from '@/src/modules/settings/application/syncTankVolumes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await syncTankVolumes(user.stationId))
  },
})
