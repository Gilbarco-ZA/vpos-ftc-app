import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { retryFailedTransactionFiscalization } from '@/src/modules/transactions/application/commands/retry-failed-transaction-fiscalization'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'
import { requiresCustomerForFiscalizationRetry } from '@/src/modules/transactions/domain/fiscalization-retry-policy'

type Body = {
  csrf_token?: string
  transactionIds?: string[]
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<Body>({
  roles: ['manager', 'administrator', 'tenant'],
  handler: async (_req, { user, body }) => {
    const transactionIds = Array.from(
      new Set(
        (Array.isArray(body.transactionIds) ? body.transactionIds : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 200)

    const retried: string[] = []
    const skipped: Array<{ transactionId: string; reason: string }> = []

    for (const transactionId of transactionIds) {
      try {
        if (user.role !== 'tenant') {
          const transaction = await getTransactionDetails(
            user.stationId,
            transactionId,
          )
          if (!transaction) {
            skipped.push({ transactionId, reason: 'Transaction not found' })
            continue
          }
          if (String(transaction.status || '').toUpperCase() !== 'FAILED') {
            skipped.push({ transactionId, reason: 'Transaction is not FAILED' })
            continue
          }
          if (
            requiresCustomerForFiscalizationRetry({
              customerId: transaction.customer_id,
              domsSourceSystem: transaction.doms_source_system,
            })
          ) {
            skipped.push({
              transactionId,
              reason: 'Customer link required before fiscalization retry',
            })
            continue
          }
        }

        await retryFailedTransactionFiscalization(user.stationId, transactionId)
        retried.push(transactionId)
      } catch (error) {
        skipped.push({
          transactionId,
          reason: error instanceof Error ? error.message : 'Retry failed',
        })
      }
    }

    return ok({
      requested: transactionIds.length,
      retried: retried.length,
      skipped: skipped.length,
      retriedTransactionIds: retried,
      skippedTransactions: skipped,
    })
  },
})
