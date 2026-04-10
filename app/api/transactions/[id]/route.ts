import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const row = await getTransactionDetails(
      user.stationId,
      String(params?.id || '').trim(),
    )
    return ok(row)
  },
})
