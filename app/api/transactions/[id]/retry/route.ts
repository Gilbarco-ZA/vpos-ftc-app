import { NextResponse } from 'next/server'

import { conflictError } from '@/src/platform/web/api/api-error'
import { getReturnUrl, wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { retryFailedTransactionFiscalization } from '@/src/modules/transactions/application/commands/retry-failed-transaction-fiscalization'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'
import { requiresCustomerForFiscalizationRetry } from '@/src/modules/transactions/domain/fiscalization-retry-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  { csrf_token?: string },
  { id: string }
>({
  roles: ['manager', 'administrator', 'tenant'],
  handler: async (req, { user, params }) => {
    const transactionId = String(params.id || '').trim()

    if (user.role !== 'tenant') {
      const transaction = await getTransactionDetails(
        user.stationId,
        transactionId,
      )
      if (
        requiresCustomerForFiscalizationRetry({
          customerId: transaction?.customer_id,
          domsSourceSystem: transaction?.doms_source_system,
        })
      ) {
        throw conflictError('Link a customer before retrying fiscalization.', {
          transactionId,
          code: 'CUSTOMER_LINK_REQUIRED',
        })
      }
    }

    const result = await retryFailedTransactionFiscalization(
      user.stationId,
      transactionId,
    )
    const response = ok(result)
    if (wantsHtmlRedirect(req) && response.ok) {
      return NextResponse.redirect(getReturnUrl(req), { status: 303 })
    }
    return response
  },
})
