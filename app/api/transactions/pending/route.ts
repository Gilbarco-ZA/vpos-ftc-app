import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listPendingTransactions } from '@/src/modules/transactions/application/queries/list-pending-transactions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user }) => {
    const rows = await listPendingTransactions(user.stationId)
    return ok({ rows })
  },
})
