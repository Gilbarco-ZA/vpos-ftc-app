import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { clearAdminLogs } from '@/src/modules/admin-logs/application/clearAdminLogs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    return await clearAdminLogs(user.stationId, body)
  },
})
