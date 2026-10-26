import { badRequest, ok } from '@/src/platform/web/api/response'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'
import { isUuid } from '@/src/shared/utils/uuid'

import { reconcileTanzaniaFiscalizingTransactionsCommand } from '@/src/modules/transactions/application/commands/reconcile-tanzania-fiscalizing-transactions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<{
  transactionIds?: unknown
  csrf_token?: string
}>({
  roles: ['manager', 'administrator', 'field_engineer'],
  handler: async (_req, { user, body }) => {
    const ids = body?.transactionIds
    if (!Array.isArray(ids) || ids.length > 100 ||
        ids.some((id) => typeof id !== 'string' || !isUuid(id))) {
      return badRequest('Provide up to 100 valid transaction IDs')
    }
    const transactionIds = Array.from(new Set(ids as string[]))
    if (transactionIds.length === 0) {
      return ok({ checked: 0, finalized: 0, failed: 0 })
    }
    return ok(await reconcileTanzaniaFiscalizingTransactionsCommand({
      stationId: user.stationId,
      transactionIds,
    }))
  },
})
