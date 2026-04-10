import { fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { createCreditNote } from '@/src/modules/transactions/application/commands'
import { getCreditNoteDetails } from '@/src/modules/transactions/application/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params }) => {
    const transactionId = String(params?.id || '').trim()
    if (!transactionId) return fail('transactionId is required', 400)

    const details = await getCreditNoteDetails(user.stationId, transactionId)
    if (!details) return fail('Credit note not found', 404)

    return ok(details)
  },
})

type CreditNoteBody = {
  csrf_token?: string
  reason_code?: string
  reasonCode?: string
  notes?: string
}

export const POST = defineMutationRoute<CreditNoteBody, { id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params, body }) => {
    const result = await createCreditNote({
      stationId: user.stationId,
      createdByName: user.name ?? null,
      transactionId: String(params?.id || '').trim(),
      reasonCode: String(body?.reason_code || body?.reasonCode || '').trim(),
      notes: String(body?.notes || '').trim(),
    })
    return ok(result)
  },
})
