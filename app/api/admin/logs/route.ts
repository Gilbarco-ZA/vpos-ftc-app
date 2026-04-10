import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { downloadAdminLogs } from '@/src/modules/admin-logs/application/downloadAdminLogs'
import { getAdminLogs } from '@/src/modules/admin-logs/application/getAdminLogs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    return await getAdminLogs(user.stationId, req.url)
  },
})

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    return await downloadAdminLogs(user.stationId, body)
  },
})
