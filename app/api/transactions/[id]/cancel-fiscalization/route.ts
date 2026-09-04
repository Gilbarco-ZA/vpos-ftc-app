import { NextResponse } from 'next/server'

import {
  conflictError,
  notFoundError,
} from '@/src/platform/web/api/api-error'
import { getReturnUrl, wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { cancelStuckTransactionFiscalization } from '@/src/modules/transactions/application/commands/cancel-stuck-transaction-fiscalization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  { csrf_token?: string },
  { id: string }
>({
  roles: ['manager', 'administrator'],
  handler: async (req, { user, params }) => {
    const transactionId = String(params.id || '').trim()
    const result = await cancelStuckTransactionFiscalization(
      user.stationId,
      transactionId,
    )

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        throw notFoundError('Transaction not found.', { transactionId })
      }
      if (result.reason === 'ALREADY_FISCALIZED') {
        throw conflictError(
          'This transaction already has a fiscalization reference and cannot be reset.',
          { transactionId, status: result.status },
        )
      }
      throw conflictError(
        'Only a transaction currently stuck in FISCALIZING can have its fiscalization attempt cancelled.',
        { transactionId, status: result.status },
      )
    }

    const response = ok({
      transactionId,
      status: 'FAILED',
      retryable: true,
    })
    if (wantsHtmlRedirect(req) && response.ok) {
      return NextResponse.redirect(getReturnUrl(req, '/transactions'), {
        status: 303,
      })
    }
    return response
  },
})
