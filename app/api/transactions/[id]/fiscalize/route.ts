import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { fiscalizeQueuedTransaction } from '@/src/modules/transactions/application/commands/fiscalize-queued-transaction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FiscalizeBody = {
  csrf_token?: string
  odometer?: string
  paymentType?: string
  payment_type?: string
  vehicleRegNr?: string
  vehicle_reg_nr?: string
  customer?: {
    id?: string | null
    tin?: string | null
    buyerName?: string | null
    buyer_name?: string | null
  }
}

export const POST = defineMutationRoute<FiscalizeBody, { id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params, body }) => {
    const result = await fiscalizeQueuedTransaction({
      stationId: user.stationId,
      transactionId: String(params.id || '').trim(),
      customer: body.customer
        ? {
            id: body.customer.id ?? null,
            tin: body.customer.tin ?? null,
            buyerName:
              body.customer.buyerName ?? body.customer.buyer_name ?? null,
          }
        : null,
    })
    return ok(result)
  },
})
