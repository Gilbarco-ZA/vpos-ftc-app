import { conflictError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'
import { logger } from '@/src/shared/utils/logger'

import { markTransactionSendNow } from '@/src/modules/transactions/application/commands/mark-transaction-send-now'
import { sendTransactionToProxyNowCommand } from '@/src/modules/transactions/application/commands/send-transaction-to-proxy-now'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'

export const POST = defineMutationRoute<{
  transactionId?: string
  csrf_token?: string
}>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const transactionId = String(body.transactionId || '').trim()

    if (user.role !== 'tenant') {
      const transaction = await getTransactionDetails(
        user.stationId,
        transactionId,
      )
      const customerId =
        transaction?.customer_id ?? transaction?.customerId ?? null
      if (!customerId) {
        throw conflictError(
          'Link a customer before sending this transaction to fiscalization.',
          { transactionId, code: 'CUSTOMER_LINK_REQUIRED' },
        )
      }
    }

    await markTransactionSendNow(user.stationId, transactionId)
    const sendResult = await sendTransactionToProxyNowCommand({
      stationId: user.stationId,
      transactionId,
    })

    logger.info('[transactions.send-now]', {
      stationId: user.stationId,
      transactionId,
      sendResult,
    })

    return ok({
      transactionId,
      immediate: true,
      ...sendResult,
    })
  },
})
