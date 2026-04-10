import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getForecourtConnectionStatus } from '@/src/modules/forecourt/application/getForecourtConnectionStatus'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) =>
    ok(await getForecourtConnectionStatus(user.stationId)),
})
