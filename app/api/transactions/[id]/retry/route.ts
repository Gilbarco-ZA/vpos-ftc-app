import { NextResponse } from 'next/server'

import { getReturnUrl, wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { retryFailedTransactionFiscalization } from '@/src/modules/transactions/application/commands/retry-failed-transaction-fiscalization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  { csrf_token?: string },
  { id: string }
>({
  roles: ['manager', 'administrator', 'tenant'],
  handler: async (req, { user, params }) => {
    const result = await retryFailedTransactionFiscalization(
      user.stationId,
      String(params.id || '').trim(),
    )
    const response = ok(result)
    if (wantsHtmlRedirect(req) && response.ok) {
      return NextResponse.redirect(getReturnUrl(req), { status: 303 })
    }
    return response
  },
})
