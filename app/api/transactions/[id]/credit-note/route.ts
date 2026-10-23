import { fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'
import { isUuid } from '@/src/shared/utils/uuid'

import { getStationCountryCode } from '@/src/modules/tanzania-fiscal/application/country'

import { isKenyaCreditNoteReasonCode } from '@/src/modules/transactions/domain/kenyaCreditNoteReasons'
import { createCreditNote } from '@/src/modules/transactions/application/commands'
import { getCreditNoteDetails } from '@/src/modules/transactions/application/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['manager', 'administrator', 'field_engineer'],
  handler: async (_req, { user, params }) => {
    const transactionId = String(params?.id || '').trim()
    if (!transactionId) return fail('transactionId is required', 400)
    if (!isUuid(transactionId)) return fail('transactionId must be a UUID', 400)

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
  transactionId?: string
}

export const POST = defineMutationRoute<CreditNoteBody, { id: string }>({
  roles: ['manager', 'administrator', 'field_engineer'],
  handler: async (_req, { user, body }) => {
    const transactionId = String(body?.transactionId || '').trim()
    if (!transactionId) return fail('transactionId is required', 400)
    if (!isUuid(transactionId)) return fail('transactionId must be a UUID', 400)

    const country = String(await getStationCountryCode(user.stationId)).trim().toUpperCase()
    if (country !== 'KE' && country !== 'KEN' && country !== 'KENYA') {
      return fail('Credit notes are currently supported only for Kenya stations.', 400)
    }

    const reasonCode = String(body?.reason_code || body?.reasonCode || '').trim()
    if (!isKenyaCreditNoteReasonCode(reasonCode)) {
      return fail('Kenya credit-note reasonCode must be 01 through 13.', 400)
    }

    const result = await createCreditNote({
      stationId: user.stationId,
      createdByName: user.name ?? null,
      transactionId,
      reasonCode,
      notes: String(body?.notes || '').trim(),
    })
    return ok(result)
  },
})
