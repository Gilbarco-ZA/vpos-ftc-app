'use client'

import type { TransactionBuilderProduct } from '@/components/transactions/TransactionProductEditor'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useCallback, useMemo, useState } from 'react'
import { Pencil, RefreshCcw } from 'lucide-react'

import { formatNumber } from '@/src/shared/utils/format'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import StatusBadge from '@/components/transactions/StatusBadge'
import TransactionLinesEditorSheet from '@/components/transactions/TransactionLinesEditorSheet'
import { Button } from '@/components/ui/button'
import { DetailItem, DetailList } from '@/components/ui/detail-list'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const canEditItems = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED', 'PENDING'].includes(
    String(status || '').toUpperCase(),
  )

const formatDate = (value: any) =>
  value ? new Date(value).toLocaleString() : '—'

const stringifySafe = (value: any) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const readString = (value: any, fallback = '—') => {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

const readNumber = (value: any) => {
  if (value == null || value === '') return null
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

export function RelatedTransactionPanel({
  transactionId,
  initialTransaction,
  products,
  decimals,
}: {
  transactionId: string
  initialTransaction: any | null
  products: TransactionBuilderProduct[]
  decimals: DecimalSettings
}) {
  const [csrfToken, setCsrfToken] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transaction, setTransaction] = useState<any | null>(initialTransaction)
  const [rawOpen, setRawOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refreshTransaction = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(transactionId)}`,
        { cache: 'no-store' },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setTransaction(null)
        setError(String(body?.error?.message || 'Unable to load transaction.'))
        return
      }
      setTransaction(body?.data ?? null)
    } catch (err: any) {
      setTransaction(null)
      setError(String(err?.message || 'Unable to load transaction.'))
    } finally {
      setLoading(false)
    }
  }, [transactionId])

  const lines = useMemo(
    () => (Array.isArray(transaction?.lines) ? transaction.lines : []),
    [transaction],
  )

  const totalAmount = readNumber(
    transaction?.total_amount ?? transaction?.totalAmount,
  )
  const volume = readNumber(transaction?.volume)
  const lineCount = lines.length
  const status = readString(transaction?.status)
  const canEdit = transaction ? canEditItems(status) : false

  const transactionQueue = transaction?.transactionQueue ?? null

  return (
    <div className="rounded border bg-[var(--surface-card)] p-4">
      <CsrfBootstrap onToken={setCsrfToken} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Related transaction</h2>
          <div className="text-sm text-[var(--text-secondary)]">
            Transaction ID:{' '}
            <span className="font-mono text-xs">{transactionId}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refreshTransaction()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRawOpen(true)}
            disabled={!transaction}
          >
            View raw details
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={!transaction || !csrfToken || !canEdit}
            title={
              !transaction
                ? 'Transaction not found'
                : !canEdit
                  ? 'This transaction cannot be edited in its current status'
                  : !csrfToken
                    ? 'Loading…'
                    : 'Edit transaction items'
            }
            className="gap-2"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit items
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!transaction ? (
        <div className="mt-4 rounded border border-dashed bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
          No related transaction could be loaded for this inbox row.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <DetailList columns={3}>
            <DetailItem label="Status">
              <StatusBadge status={status} />
            </DetailItem>
            <DetailItem label="POS reference">
              {readString(
                transaction?.pos_reference ?? transaction?.posReference,
              )}
            </DetailItem>
            <DetailItem label="Transaction time">
              {formatDate(
                transaction?.transaction_date_time ??
                  transaction?.transactionDateTime,
              )}
            </DetailItem>
            <DetailItem label="Pump">
              {readString(transaction?.pump_number ?? transaction?.pumpNumber)}
            </DetailItem>
            <DetailItem label="Fuel type">
              {readString(transaction?.fuel_type ?? transaction?.fuelType)}
            </DetailItem>
            <DetailItem label="Volume">
              {formatNumber(volume, decimals.volume)}
            </DetailItem>
            <DetailItem label="Total amount">
              {formatNumber(totalAmount, decimals.money)}
            </DetailItem>
            <DetailItem label="Retry count">
              {readString(transaction?.retry_count ?? transaction?.retryCount)}
            </DetailItem>
            <DetailItem label="Queue enqueued">
              {formatDate(
                transaction?.fiscal_queue_enqueued_at ??
                  transaction?.fiscalQueueEnqueuedAt,
              )}
            </DetailItem>
            <DetailItem label="Buyer name">
              {readString(transaction?.buyer_name ?? transaction?.buyerName)}
            </DetailItem>
            <DetailItem label="TIN">{readString(transaction?.tin)}</DetailItem>
            <DetailItem label="Line count">{lineCount}</DetailItem>
            <DetailItem label="Last error" className="lg:col-span-3">
              <span className="text-red-700">
                {readString(transaction?.last_error ?? transaction?.lastError)}
              </span>
            </DetailItem>
          </DetailList>

          <div className="rounded border">
            <div className="border-b px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Transaction lines
            </div>
            {lines.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                No transaction lines found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Unit price</th>
                      <th className="px-4 py-2 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line: any, index: number) => (
                      <tr key={String(line?.id ?? index)} className="border-t">
                        <td className="px-4 py-2">
                          {readString(line?.product_name ?? line?.productName)}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {readString(line?.product_code ?? line?.productCode)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatNumber(
                            readNumber(line?.quantity),
                            decimals.volume,
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatNumber(
                            readNumber(line?.unit_price ?? line?.unitPrice),
                            decimals.money,
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatNumber(
                            readNumber(line?.line_total ?? line?.lineTotal),
                            decimals.money,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded border">
            <div className="border-b px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Associated transaction queue
            </div>
            {!transactionQueue ? (
              <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                No transaction_queue row is linked to this transaction.
              </div>
            ) : (
              <div className="space-y-4 px-4 py-3">
                <DetailList columns={3}>
                  <DetailItem label="Queue ID">
                    <span className="font-mono text-xs">
                      {readString(transactionQueue?.id)}
                    </span>
                  </DetailItem>
                  <DetailItem label="Queue status">
                    {readString(transactionQueue?.status)}
                  </DetailItem>
                  <DetailItem label="Retry count">
                    {readString(
                      transactionQueue?.retry_count ??
                        transactionQueue?.retryCount,
                    )}
                  </DetailItem>
                  <DetailItem label="Next attempt">
                    {formatDate(
                      transactionQueue?.next_attempt_at ??
                        transactionQueue?.nextAttemptAt,
                    )}
                  </DetailItem>
                  <DetailItem label="Processing started">
                    {formatDate(
                      transactionQueue?.processing_started_at ??
                        transactionQueue?.processingStartedAt,
                    )}
                  </DetailItem>
                  <DetailItem label="Updated">
                    {formatDate(
                      transactionQueue?.updated_at ??
                        transactionQueue?.updatedAt,
                    )}
                  </DetailItem>
                  <DetailItem label="Created">
                    {formatDate(
                      transactionQueue?.created_at ??
                        transactionQueue?.createdAt,
                    )}
                  </DetailItem>
                  <DetailItem label="Transaction ID">
                    <span className="font-mono text-xs">
                      {readString(
                        transactionQueue?.transaction_id ??
                          transactionQueue?.transactionId,
                      )}
                    </span>
                  </DetailItem>
                  <DetailItem label="Last error" className="lg:col-span-3">
                    <span className="text-red-700">
                      {readString(
                        transactionQueue?.last_error ??
                          transactionQueue?.lastError,
                      )}
                    </span>
                  </DetailItem>
                </DetailList>

                <div>
                  <div className="text-sm font-medium text-[var(--text-secondary)]">
                    Queue payload
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Raw transaction_queue payload used when building the proxy
                    fiscal request.
                  </div>
                  <pre className="mt-2 max-h-[360px] overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
                    {stringifySafe(transactionQueue?.payload ?? null)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={rawOpen} onOpenChange={setRawOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Transaction raw details</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[70vh] overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {transaction
              ? stringifySafe(transaction)
              : 'Transaction not found.'}
          </pre>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRawOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionLinesEditorSheet
        open={editing}
        transactionId={
          transaction ? String(transaction?.id ?? transactionId) : null
        }
        products={products}
        decimals={decimals}
        csrfToken={csrfToken}
        onClose={() => setEditing(false)}
        showToast={(variant, message) => {
          if (variant === 'error') setError(message)
          else setNotice(message)
        }}
        onSaved={async () => {
          setEditing(false)
          setNotice('Transaction items updated.')
          await refreshTransaction()
        }}
      />
    </div>
  )
}
