import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getTransactionInvoicePayload } from '@/src/modules/transactions/application/queries/get-transaction-invoice-payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const payload = await getTransactionInvoicePayload(
      user.stationId,
      String(params?.id || '').trim(),
    )
    return ok(payload)
  },
})
