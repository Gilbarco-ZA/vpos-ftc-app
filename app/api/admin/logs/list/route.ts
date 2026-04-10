import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listAdminLogs } from '@/src/modules/admin-logs/application/listAdminLogs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    return await listAdminLogs(user.stationId, req.url)
  },
})
