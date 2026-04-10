import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listControlEvents } from '@/src/modules/control/application/listControlEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (req, { user }) => {
    return await listControlEvents(user.stationId, req)
  },
})
