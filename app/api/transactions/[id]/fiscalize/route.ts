import { conflictError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { fiscalizeQueuedTransaction } from '@/src/modules/transactions/application/commands/fiscalize-queued-transaction'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'

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
    const transactionId = String(params.id || '').trim()
    const providedCustomerId = String(body.customer?.id ?? '').trim()
    const transaction = providedCustomerId
      ? null
      : await getTransactionDetails(user.stationId, transactionId)
    const customerId =
      providedCustomerId || String(transaction?.customer_id ?? '').trim()

    if (!customerId) {
      throw conflictError(
        'Resolve and link a customer before fiscalizing this transaction.',
        { transactionId, code: 'CUSTOMER_LINK_REQUIRED' },
      )
    }

    const result = await fiscalizeQueuedTransaction({
      stationId: user.stationId,
      transactionId,
      customer: {
        id: customerId,
        tin: body.customer?.tin ?? transaction?.tin ?? null,
        buyerName:
          body.customer?.buyerName ??
          body.customer?.buyer_name ??
          transaction?.buyer_name ??
          null,
      },
      vehicleDetails: {
        odometer: body.odometer,
        paymentType: body.paymentType ?? body.payment_type,
        vehicleRegNr: body.vehicleRegNr ?? body.vehicle_reg_nr,
      },
    })
    return ok(result)
  },
})
