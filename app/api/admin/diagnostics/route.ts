import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminDiagnostics } from '@/src/modules/admin-diagnostics/application/getAdminDiagnostics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return await getAdminDiagnostics(user.stationId)
  },
})
