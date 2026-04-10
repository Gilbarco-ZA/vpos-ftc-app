import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { allocateTransaction } from '@/src/modules/transactions/application/commands/allocate-transaction'

export const POST = defineMutationRoute<{
  transactionId?: string
  customerId?: string
  tin?: string
  csrf_token?: string
}>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const result = await allocateTransaction({
      stationId: user.stationId,
      transactionId: String(body.transactionId || '').trim(),
      customerId: String(body.customerId || '').trim(),
      allocatedBy: user.id,
    })
    return ok(result)
  },
})
