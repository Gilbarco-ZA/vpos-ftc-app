import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'
import { logger } from '@/src/shared/utils/logger'

import { markTransactionSendNow } from '@/src/modules/transactions/application/commands/mark-transaction-send-now'
import { sendTransactionToProxyNow } from '@/src/modules/transactions/infrastructure/fiscalization/proxySenderWorker'

export const POST = defineMutationRoute<{
  transactionId?: string
  csrf_token?: string
}>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const transactionId = String(body.transactionId || '').trim()

    await markTransactionSendNow(user.stationId, transactionId)
    const sendResult = await sendTransactionToProxyNow({
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
