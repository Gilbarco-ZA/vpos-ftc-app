import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminDiagnosticsOverview } from '@/src/modules/admin-diagnostics/application/getAdminDiagnosticsOverview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return await getAdminDiagnosticsOverview(user.stationId)
  },
})
