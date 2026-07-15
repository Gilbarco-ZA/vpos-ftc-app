'use client'

import type { TransactionBuilderProduct } from '@/components/transactions/TransactionProductEditor'
import type { FiscalInboxDetailViewModel } from '@/src/modules/fiscal-inbox/presentation/view-models/fiscal-inbox.view-model'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useEffect, useState } from 'react'

import { PageSkeleton } from '@/components/ui/page-skeleton'

import { FiscalInboxDetailView } from './FiscalInboxDetailView'
import { RelatedTransactionPanel } from './RelatedTransactionPanel'
import { ReplayClient } from './replayClient'
import { RowActionsClient } from './rowActionsClient'

type DetailData = {
  detail: FiscalInboxDetailViewModel
  transactionId: string | null
  transaction: unknown | null
  products: TransactionBuilderProduct[]
  decimals: DecimalSettings
}

export function FiscalInboxDetailLoader({ id }: { id: string }) {
  const [data, setData] = useState<DetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const numericId = Number(id)
  const invalidId = !Number.isFinite(numericId) || numericId <= 0

  useEffect(() => {
    if (invalidId) return

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(
          `/api/runtime/fiscal/inbox/${encodeURIComponent(id)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body?.ok === false) {
          throw new Error(body?.error?.message || 'Not found.')
        }
        setData(body.data)
      } catch (reason) {
        if (controller.signal.aborted) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to load fiscal inbox row.',
        )
      }
    })()

    return () => controller.abort()
  }, [id, invalidId])

  if (invalidId) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Fiscal Inbox</h1>
        <div className="rounded border bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
          Invalid id.
        </div>
      </div>
    )
  }

  if (!data && !error) return <PageSkeleton rows={8} />

  if (!data) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Fiscal Inbox</h1>
        <div className="rounded border bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
          {error}
        </div>
      </div>
    )
  }

  const row = data.detail

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fiscal Inbox Row #{row.id}</h1>
        <div className="text-sm text-[var(--text-secondary)]">
          Station: <span className="font-mono text-xs">{row.station_id}</span>
        </div>
      </div>

      <FiscalInboxDetailView row={row} />

      {data.transactionId ? (
        <RelatedTransactionPanel
          transactionId={data.transactionId}
          initialTransaction={data.transaction}
          products={data.products}
          decimals={data.decimals}
        />
      ) : null}

      <div className="mt-4">
        <RowActionsClient id={row.id} transactionId={data.transactionId} />
      </div>

      <ReplayClient
        id={row.id}
        requestId={row.request_id}
        messageJson={row.message_json}
      />
    </div>
  )
}
