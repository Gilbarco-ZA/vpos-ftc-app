import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getControlStatus } from '@/src/modules/control/application/getControlStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return await getControlStatus(user.stationId)
  },
})
