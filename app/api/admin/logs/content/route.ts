import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminLogContent } from '@/src/modules/admin-logs/application/getAdminLogContent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    return await getAdminLogContent(user.stationId, req.url)
  },
})
