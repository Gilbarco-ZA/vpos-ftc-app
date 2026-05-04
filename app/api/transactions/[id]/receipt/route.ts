import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getOrCreateLatestTransactionReceipt } from '@/src/modules/transactions/application/queries/get-or-create-latest-transaction-receipt'
import { getTransactionReceipt } from '@/src/modules/transactions/application/queries/get-transaction-receipt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const transactionId = String(params?.id || '').trim()
    const receipt = await getTransactionReceipt(user.stationId, transactionId)
    if (receipt) {
      await getOrCreateLatestTransactionReceipt(user.stationId, transactionId)
    }
    return ok(receipt)
  },
})
