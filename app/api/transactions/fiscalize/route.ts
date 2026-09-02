import { NextResponse } from 'next/server'

import { conflictError } from '@/src/platform/web/api/api-error'
import { getReturnUrl, wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { fiscalizeTransactionLegacy } from '@/src/modules/transactions/application/commands/fiscalize-transaction-legacy'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user, body }) => {
    if (user.role !== 'tenant') {
      const transactionId = String(
        body?.transactionId ?? body?.transaction_id ?? '',
      ).trim()
      const providedCustomerId = String(body?.customer?.id ?? '').trim()
      const transaction = providedCustomerId
        ? null
        : await getTransactionDetails(user.stationId, transactionId)
      const linkedCustomerId =
        providedCustomerId ||
        String(transaction?.customer_id ?? transaction?.customerId ?? '').trim()

      if (!linkedCustomerId) {
        throw conflictError(
          'Link a customer before sending this transaction to fiscalization.',
          { transactionId, code: 'CUSTOMER_LINK_REQUIRED' },
        )
      }
    }

    const result = await fiscalizeTransactionLegacy(user.stationId, body)
    const response = ok(result)
    if (wantsHtmlRedirect(req) && response.ok) {
      return NextResponse.redirect(getReturnUrl(req), { status: 303 })
    }
    return response
  },
})
