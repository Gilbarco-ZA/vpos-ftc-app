import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getLegacyPosStatus } from '@/src/modules/vpos/application/getLegacyPosStatus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    return await getLegacyPosStatus(user.stationId)
  },
})
