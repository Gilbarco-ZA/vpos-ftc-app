import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listNonFiscalizedTransactions } from '@/src/modules/transactions/application/queries/list-non-fiscalized-transactions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user }) => {
    const rows = await listNonFiscalizedTransactions(user.stationId)
    return ok({ rows })
  },
})
