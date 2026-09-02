import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listFuelOptions } from '@/src/modules/transactions/application/queries/list-fuel-options'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    return ok({ options: await listFuelOptions(user.stationId) })
  },
})
