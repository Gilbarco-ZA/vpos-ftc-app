import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listAdminArchivedLogs } from '@/src/modules/admin-logs/application/listAdminArchivedLogs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    return await listAdminArchivedLogs(user.stationId, req.url)
  },
})
