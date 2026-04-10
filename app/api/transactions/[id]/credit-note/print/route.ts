import { toBool } from '@/src/platform/web/api/request'
import { fail, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { runPosControlCommand } from '@/src/modules/pos/application/runPosControlCommand'
import { getCreditNoteDetails } from '@/src/modules/transactions/application/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CreditNotePrintBody = {
  csrf_token?: string
  csrfToken?: string
  isReprint?: boolean | string | number | null
}

export const POST = defineMutationRoute<CreditNotePrintBody, { id: string }>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, params, body }) => {
    try {
      const transactionId = String(params?.id || '').trim()
      if (!transactionId) return fail('transactionId is required', 400)

      const details = await getCreditNoteDetails(user.stationId, transactionId)
      if (!details?.receipt) return fail('Credit note receipt not found', 404)

      const isReprint = toBool(body?.isReprint, true) === true
      const printPayload = {
        type: 'receipt',
        copies: 1,
        correlationId: uuidv4(),
        idempotencyKey: `doms-credit-note:${transactionId}:${details.creditNote?.id ?? 'unknown'}:${isReprint ? 'reprint' : 'initial'}`,
        data: {
          source: 'vpos.credit-note-receipt',
          transactionId,
          creditNoteId: String(details.creditNote?.id ?? ''),
          isReprint,
          receipt: details.receipt,
          raw: details.raw ?? null,
        },
      }

      const print = await runPosControlCommand({
        stationId: user.stationId,
        command: 'print',
        body: printPayload,
      })

      return ok({
        transactionId,
        creditNoteId: details.creditNote?.id ?? null,
        print,
      })
    } catch (err: any) {
      if (
        err?.code === 'POS_BACKEND_DISABLED' ||
        err?.code === 'NOT_CONFIGURED'
      ) {
        return fail(
          'POS receipt printing is not configured for this station',
          409,
          undefined,
          { code: err?.code },
        )
      }
      if (typeof err?.status === 'number') {
        return fail(
          'POS receipt print failed',
          err.status >= 500 ? 502 : err.status,
          undefined,
          { code: err?.code, details: err?.details ?? null },
        )
      }
      throw err
    }
  },
})
