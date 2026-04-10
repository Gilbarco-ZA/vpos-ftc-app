import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getTransactionReceipt } from '@/src/modules/transactions/application/queries/get-transaction-receipt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const receipt = await getTransactionReceipt(
      user.stationId,
      String(params?.id || '').trim(),
    )
    return ok(receipt)
  },
})
