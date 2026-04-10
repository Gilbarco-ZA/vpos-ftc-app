import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getPumpRuntimeState } from '@/src/modules/pumps/application/getPumpRuntimeState'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return ok(await getPumpRuntimeState(user.stationId))
  },
})
