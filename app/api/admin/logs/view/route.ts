import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { viewAdminLog } from '@/src/modules/admin-logs/application/viewAdminLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    return await viewAdminLog(user.stationId, req.url)
  },
})
