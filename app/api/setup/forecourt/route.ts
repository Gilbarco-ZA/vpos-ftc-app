import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getSetupForecourtCounts } from '@/src/modules/setup/application/getSetupForecourtCounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) =>
    ok(await getSetupForecourtCounts(user.stationId)),
})
