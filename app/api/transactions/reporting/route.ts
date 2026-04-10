import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getTransactionReporting } from '@/src/modules/reports/application/getTransactionReporting'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const reporting = await getTransactionReporting(user.stationId)
    return ok(reporting)
  },
})
