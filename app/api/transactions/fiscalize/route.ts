import { NextResponse } from 'next/server'

import { getReturnUrl, wantsHtmlRedirect } from '@/src/platform/web/api/request'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { fiscalizeTransactionLegacy } from '@/src/modules/transactions/application/commands/fiscalize-transaction-legacy'

export const POST = defineMutationRoute<Record<string, any>>({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user, body }) => {
    const result = await fiscalizeTransactionLegacy(user.stationId, body)
    const response = ok(result)
    if (wantsHtmlRedirect(req) && response.ok) {
      return NextResponse.redirect(getReturnUrl(req), { status: 303 })
    }
    return response
  },
})
