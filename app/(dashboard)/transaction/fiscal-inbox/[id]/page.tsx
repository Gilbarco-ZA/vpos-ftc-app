import { requireAuth } from '@/src/shared/auth'
import { getStationDecimalSettings } from '@/src/shared/server/decimalSettings'

import { getFiscalInboxByIdQuery } from '@/src/modules/fiscal-inbox/application/queries/get-fiscal-inbox-by-id'
import {
  getFiscalInboxTransactionId,
  presentFiscalInboxDetail,
} from '@/src/modules/fiscal-inbox/presentation/presenters/fiscal-inbox.presenter'
import { getTransactionDetails } from '@/src/modules/transactions/application/queries/get-transaction-details'
import { listTransactionCatalogProducts } from '@/src/modules/transactions/application/queries/list-transaction-catalog-products'

import { FiscalInboxDetailView } from './FiscalInboxDetailView'
import { RelatedTransactionPanel } from './RelatedTransactionPanel'
import { ReplayClient } from './replayClient'
import { RowActionsClient } from './rowActionsClient'

export const dynamic = 'force-dynamic'

export default async function FiscalInboxDetailPage(
  props: {
    params: Promise<{ id: string }>
  }
) {
  const params = await props.params;
  const user = await requireAuth(['administrator'])
  const id = Number(params.id)
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Fiscal Inbox</h1>
        <div className="rounded border bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
          Invalid id.
        </div>
      </div>
    )
  }

  const row = presentFiscalInboxDetail(
    await getFiscalInboxByIdQuery({ id, stationId: user.stationId }),
  )
  if (!row) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Fiscal Inbox</h1>
        <div className="rounded border bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
          Not found.
        </div>
      </div>
    )
  }

  const transactionId = getFiscalInboxTransactionId(row)

  const [initialTransaction, products, decimals] = transactionId
    ? await Promise.all([
        getTransactionDetails(user.stationId, transactionId).catch(() => null),
        listTransactionCatalogProducts(user.stationId).catch(() => []),
        getStationDecimalSettings(user.stationId),
      ])
    : [null, [], await getStationDecimalSettings(user.stationId)]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fiscal Inbox Row #{row.id}</h1>
        <div className="text-sm text-[var(--text-secondary)]">
          Station: <span className="font-mono text-xs">{row.station_id}</span>
        </div>
      </div>

      <FiscalInboxDetailView row={row} />

      {transactionId ? (
        <RelatedTransactionPanel
          transactionId={transactionId}
          initialTransaction={initialTransaction}
          products={products}
          decimals={decimals}
        />
      ) : null}

      <div className="mt-4">
        <RowActionsClient id={row.id} transactionId={transactionId} />
      </div>

      <ReplayClient
        id={row.id}
        requestId={row.request_id}
        messageJson={row.message_json}
      />
    </div>
  )
}
