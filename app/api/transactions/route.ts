import { ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { enqueueTransactionReceiptPrint } from '@/src/modules/transactions/application/commands/enqueue-transaction-receipt-print'
import { listTransactions } from '@/src/modules/transactions/application/queries/list-transactions'

export const dynamic = 'force-dynamic'

type PrintBody = {
  csrf_token?: string
  filename?: string
  data?: unknown
  state?: unknown
  transactionId?: string
}

const parseNumeric = (value: string | null) => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const GET = defineGetRoute({
  roles: ['tenant', 'manager', 'administrator'],
  handler: async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const rows = await listTransactions(user.stationId, {
      limit: parseNumeric(searchParams.get('limit')),
      page: parseNumeric(searchParams.get('page')),
      pageSize: parseNumeric(searchParams.get('pageSize')),
      status: searchParams.get('status'),
      excludeStatus: searchParams.get('excludeStatus'),
      scope:
        (searchParams.get('scope') as
          | 'all'
          | 'non-fiscalized'
          | 'fiscalized'
          | null) ?? null,
      transactionId: searchParams.get('transactionId'),
      pumpNumber: parseNumeric(
        searchParams.get('pumpNumber') || searchParams.get('pump'),
      ),
      search: searchParams.get('search') || searchParams.get('q'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    })
    return ok(rows)
  },
})

export const POST = defineMutationRoute<PrintBody>({
  roles: ['manager', 'administrator'],
  handler: async (_req, { user, body }) => {
    const transactionId = String(
      body?.transactionId || body?.filename || '',
    ).trim()
    const job = await enqueueTransactionReceiptPrint(
      user.stationId,
      transactionId,
    )
    return ok(job)
  },
})
