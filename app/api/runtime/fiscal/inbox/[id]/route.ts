import { fail, ok } from '@/src/platform/web/api/response'
import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

import {
  cloneRequeueFiscalMessage,
  deleteFiscalMessage,
  markFiscalMessageDead,
  markFiscalMessageFailed,
  markFiscalMessageProcessed,
  requeueFiscalMessage,
} from '@/src/modules/fiscal-inbox/application/commands'
import { getFiscalInboxByIdQuery } from '@/src/modules/fiscal-inbox/application/queries/get-fiscal-inbox-by-id'
import {
  getFiscalInboxTransactionId,
  presentFiscalInboxDetail,
  presentFiscalInboxItem,
} from '@/src/modules/fiscal-inbox/presentation/presenters/fiscal-inbox.presenter'
import {
  parseFiscalInboxItemId,
  prepareFiscalInboxItemMutation,
} from '@/src/modules/runtime/application/prepareFiscalInboxItemMutation'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'
import { listTransactionCatalogProducts } from '@/src/modules/transactions/application/queries/list-transaction-catalog-products'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ id: string }>({
  roles: ['administrator'],
  handler: async (_req, { user, params }) => {
    const id = parseFiscalInboxItemId(params?.id)
    if (!id) return fail('Invalid id')

    const row = await getFiscalInboxByIdQuery({ id, stationId: user.stationId })
    if (!row) return fail('Not found', 404)

    const detail = presentFiscalInboxDetail(row)
    if (!detail) return fail('Not found', 404)

    const transactionId = getFiscalInboxTransactionId(detail)
    const [transaction, products, decimals] = transactionId
      ? await Promise.all([
          getTransactionDetails(user.stationId, transactionId).catch(
            () => null,
          ),
          listTransactionCatalogProducts(user.stationId).catch(() => []),
          getStationDecimalSettings(user.stationId),
        ])
      : [null, [], await getStationDecimalSettings(user.stationId)]

    return ok({
      item: presentFiscalInboxItem(row),
      detail,
      transactionId,
      transaction,
      products,
      decimals,
    })
  },
})

export const PATCH = defineMutationRoute<any, { id: string }>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, params, body }) => {
    const id = parseFiscalInboxItemId(params?.id)
    if (!id) return fail('Invalid id')
    if (!user.stationId) return fail('Missing stationId')

    const prepared = prepareFiscalInboxItemMutation(body)
    if (!prepared.ok) return fail(prepared.error)

    const input = {
      id,
      stationId: user.stationId,
      errorText: prepared.value.errorText || undefined,
      requestId: prepared.value.requestId || undefined,
      messageJson: prepared.value.messageJson,
    }

    const result =
      prepared.value.action === 'DELETE'
        ? await deleteFiscalMessage(input)
        : prepared.value.action === 'REQUEUE'
          ? await requeueFiscalMessage(input)
          : prepared.value.action === 'CLONE_REQUEUE'
            ? await cloneRequeueFiscalMessage(input)
            : prepared.value.action === 'MARK_DEAD'
              ? await markFiscalMessageDead({
                  ...input,
                  errorText: input.errorText || 'Marked dead by administrator',
                })
              : prepared.value.action === 'MARK_FAILED'
                ? await markFiscalMessageFailed({
                    ...input,
                    errorText:
                      input.errorText || 'Marked failed by administrator',
                  })
                : await markFiscalMessageProcessed(input)

    if (!result) return fail('Not found')
    return ok(result)
  },
})
