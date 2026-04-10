'use client'

import type { FiscalizeResponseData } from '@/components/transactions/non-fiscalized/types'
import type { TransactionBuilderProduct } from '@/components/transactions/TransactionProductEditor'
import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import type { SelectOption } from '@/src/shared/types'
import type { TransactionListItem } from '@/src/shared/types/transactions'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  AlertTriangle,
  Copy,
  FileText,
  Pencil,
  RotateCcw,
  Send,
} from 'lucide-react'

import { safeCopy } from '@/src/shared/utils/clipboard'
import { formatDate } from '@/src/shared/utils/dates'
import { formatNumber } from '@/src/shared/utils/format'
import { logger } from '@/src/shared/utils/logger'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import NonFiscalizedDetailsSheet from '@/components/transactions/non-fiscalized/NonFiscalizedDetailsSheet'
import NonFiscalizedErrorState from '@/components/transactions/non-fiscalized/NonFiscalizedErrorState'
import NonFiscalizedFiltersRow from '@/components/transactions/non-fiscalized/NonFiscalizedFiltersRow'
import NonFiscalizedFiscalizeSheet from '@/components/transactions/non-fiscalized/NonFiscalizedFiscalizeSheet'
import StatusBadge from '@/components/transactions/StatusBadge'
import { buildNonFiscalizedSupportBundle } from '@/components/transactions/supportBundle'
import TransactionErrorDialog from '@/components/transactions/TransactionErrorDialog'
import TransactionLinesEditorSheet from '@/components/transactions/TransactionLinesEditorSheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import {
  ToastItem,
  ToastMessage,
  ToastVariant,
  ToastViewport,
} from '@/components/ui/toast'

export type { TransactionListItem }

type NonFiscalizedTransactionsPageClientProps = {
  initialTransactions: TransactionListItem[]
  products: TransactionBuilderProduct[]
  error?: string | null
  children: ReactNode
  decimals: DecimalSettings
  stationCountry?: string | null
}

type TransactionsUIContextValue = {
  refresh: () => void
  showToast: (variant: ToastVariant, message: string) => void
}

const TransactionsUIContext = createContext<TransactionsUIContextValue | null>(
  null,
)

const useTransactionsUI = () => {
  const ctx = useContext(TransactionsUIContext)
  if (!ctx) throw new Error('Transactions UI context not available')
  return ctx
}

export const NonFiscalizedTransactionsRefreshButton = () => {
  const { refresh } = useTransactionsUI()
  return (
    <Button variant="secondary" onClick={refresh}>
      Refresh
    </Button>
  )
}

type ConfirmAction =
  | { type: 'retry'; transaction: TransactionListItem }
  | { type: 'send_now'; transaction: TransactionListItem }
  | null

const errorPreviewTitle = (message: string) => {
  const firstLine = message.split('\n')[0] ?? message
  const trimmed = firstLine.trim()
  const short = trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed
  return short ? `Failure: ${short}` : 'View failure reason'
}

const canRetryFiscalization = (status: string) =>
  String(status || '').toUpperCase() === 'FAILED'

const canSendNow = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED'].includes(String(status || '').toUpperCase())

const canFiscalize = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED'].includes(String(status || '').toUpperCase())

const canEditItems = (status: string) =>
  ['OPEN', 'ALLOCATED', 'FAILED', 'PENDING'].includes(
    String(status || '').toUpperCase(),
  )

async function copySupportBundle(transaction: any) {
  try {
    const payload = {
      id: transaction.id,
      productId: transaction.productId,
      productCode: transaction.productCode,
      quantity: transaction.quantity,
      unitPrice: transaction.unitPrice,
      totalAmount: transaction.totalAmount,
      createdAt: transaction.createdAt,
    }

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))

    logger.info('[transactions]', { msg: 'Support bundle copied' })
  } catch (error) {
    logger.error('[transactions]', {
      msg: 'Failed to copy support bundle',
      error,
    })
  }
}

const mapTransactionRow = (item: any): TransactionListItem => ({
  id: String(item?.id ?? ''),
  transactionDateTime:
    item?.transaction_date_time ?? item?.transactionDateTime ?? null,
  posReference: item?.pos_reference ?? item?.posReference ?? null,
  pumpNumber: Number(item?.pump_number ?? item?.pumpNumber ?? 0),
  fuelType: item?.fuel_type ?? item?.fuelType ?? null,
  volume: item?.volume ?? null,
  totalAmount: Number(item?.total_amount ?? item?.totalAmount ?? 0),
  status: String(item?.status ?? ''),
  retryCount: Number(item?.retry_count ?? item?.retryCount ?? 0),
  fiscalQueueEnqueuedAt:
    item?.fiscal_queue_enqueued_at ?? item?.fiscalQueueEnqueuedAt ?? null,
  lastError: item?.last_error ?? item?.lastError ?? null,
})

const NonFiscalizedTransactionsPageClient = ({
  initialTransactions,
  products,
  error,
  children,
  decimals,
  stationCountry,
}: NonFiscalizedTransactionsPageClientProps) => {
  const [transactions, setTransactions] = useState(initialTransactions)
  const [loadError, setLoadError] = useState<unknown>(error ?? null)
  const [loading, setLoading] = useState(false)
  const [buyerTypeOptions, setBuyerTypeOptions] = useState<SelectOption[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [detailsTransaction, setDetailsTransaction] =
    useState<TransactionListItem | null>(null)
  const [errorTransaction, setErrorTransaction] =
    useState<TransactionListItem | null>(null)
  const [fiscalizeTransaction, setFiscalizeTransaction] =
    useState<TransactionListItem | null>(null)
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionListItem | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [csrfToken, setCsrfToken] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => {
    setTransactions(initialTransactions)
    setLoadError(error ?? null)
  }, [error, initialTransactions])

  useEffect(() => {
    const loadBuyerTypes = async () => {
      try {
        const res = await fetch('/api/config/buyer-types', {
          cache: 'no-store',
        })
        const body = await res.json().catch(() => ({}))
        const options = body?.data?.options ?? body?.options ?? []
        setBuyerTypeOptions(Array.isArray(options) ? options : [])
      } catch {
        setBuyerTypeOptions([])
      }
    }

    loadBuyerTypes()
  }, [])

  const showToast = (variant: ToastVariant, message: string) => {
    setToasts((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, variant, message },
    ])
  }

  const copyValue = async (label: string, value: string) => {
    const ok = await safeCopy(value)
    showToast(ok ? 'success' : 'error', ok ? `Copied ${label}` : 'Copy failed')
  }

  const copySupportBundle = async (transaction: TransactionListItem) => {
    const bundle = buildNonFiscalizedSupportBundle(transaction)
    const ok = await safeCopy(bundle)
    showToast(
      ok ? 'success' : 'error',
      ok ? 'Copied support bundle' : 'Copy failed',
    )
  }

  const applyUpdatedTransaction = useCallback(
    (transactionId: string, patch: Partial<TransactionListItem>) => {
      setTransactions((current) =>
        current.map((row) =>
          row.id === transactionId
            ? {
                ...row,
                ...patch,
              }
            : row,
        ),
      )
      setDetailsTransaction((current) =>
        current?.id === transactionId ? { ...current, ...patch } : current,
      )
      setFiscalizeTransaction((current) =>
        current?.id === transactionId ? { ...current, ...patch } : current,
      )
      setEditingTransaction((current) =>
        current?.id === transactionId ? { ...current, ...patch } : current,
      )
    },
    [],
  )

  const postJson = async (url: string, body: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.ok === false) {
      const msg = json?.error?.message || 'Request failed'
      const requestId = json?.error?.requestId
      throw new Error(requestId ? `${msg} (Support code: ${requestId})` : msg)
    }
    return json
  }

  const runRetry = async (transaction: TransactionListItem) => {
    setConfirmLoading(true)
    try {
      await postJson(`/api/transactions/${transaction.id}/retry`, {
        csrf_token: csrfToken,
      })
      showToast('success', 'Transaction re-queued for fiscalization')
      setConfirmAction(null)
      await refresh()
    } catch (err: any) {
      showToast('error', String(err?.message || 'Retry failed'))
    } finally {
      setConfirmLoading(false)
    }
  }

  const runSendNow = async (transaction: TransactionListItem) => {
    setConfirmLoading(true)
    try {
      await postJson('/api/transactions/send-now', {
        csrf_token: csrfToken,
        transactionId: transaction.id,
      })
      showToast('success', 'Transaction sent to fiscalization queue')
      setConfirmAction(null)
      await refresh()
    } catch (err: any) {
      showToast('error', String(err?.message || 'Send now failed'))
    } finally {
      setConfirmLoading(false)
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({
        scope: 'non-fiscalized',
        limit: '200',
      })
      if (search.trim()) params.set('search', search.trim())
      if (status !== 'ALL') params.set('status', status)
      if (startDate) params.set('from', `${startDate}T00:00:00`)
      if (endDate) params.set('to', `${endDate}T23:59:59`)

      const res = await fetch(`/api/transactions?${params.toString()}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setLoadError(res.ok ? body : { status: res.status, body })
        return
      }
      const payload = body?.data ?? body
      const items = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : []
      setTransactions(items.map(mapTransactionRow))
    } catch (err: unknown) {
      setLoadError(err)
    } finally {
      setLoading(false)
    }
  }, [search, status, startDate, endDate])

  const formatMoney = (value: number | null | undefined) =>
    formatNumber(value == null ? null : Number(value), decimals.money)
  const formatVolume = (value: number | null | undefined) =>
    formatNumber(value == null ? null : Number(value), decimals.volume)

  const handleFiscalize = async (response: FiscalizeResponseData) => {
    const transactionId = String(response?.transactionId || '')
    showToast('success', 'Transaction queued for fiscalization')
    if (transactionId) {
      applyUpdatedTransaction(transactionId, {
        status: 'PENDING',
        lastError: null,
      })
    }
    setFiscalizeTransaction(null)
    await refresh()
  }

  const filteredTransactions = useMemo(() => transactions, [transactions])

  return (
    <TransactionsUIContext.Provider value={{ refresh, showToast }}>
      <CsrfBootstrap onToken={setCsrfToken} />
      <div className="space-y-4">
        {children}

        <NonFiscalizedFiltersRow
          search={search}
          status={status}
          startDate={startDate}
          endDate={endDate}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onRefresh={refresh}
        />

        {loadError ? (
          <NonFiscalizedErrorState error={loadError} onRetry={refresh} />
        ) : loading && filteredTransactions.length === 0 ? (
          <TableSkeleton
            rows={8}
            columns={8}
            showHeader={false}
            showFilters={false}
          />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            title="No transactions"
            description="Non-fiscalized transactions appear here once imported or created."
          />
        ) : (
          <div className="relative">
            {loading ? <LoadingOverlay label="Loading transactions…" /> : null}

            <div className="overflow-hidden rounded-card border border-border bg-surface-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction time</TableHead>
                    <TableHead>POS reference</TableHead>
                    <TableHead>Pump</TableHead>
                    <TableHead>Fuel type</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-[var(--text-muted)]">
                        {formatDate(row.transactionDateTime)}
                      </TableCell>
                      <TableCell className="text-[var(--text-secondary)]">
                        {row.posReference ?? '—'}
                      </TableCell>
                      <TableCell>{row.pumpNumber}</TableCell>
                      <TableCell className="text-[var(--text-muted)]">
                        {row.fuelType ?? '—'}
                      </TableCell>
                      <TableCell className="text-[var(--text-muted)]">
                        {formatVolume(row.volume)}
                      </TableCell>
                      <TableCell className="text-[var(--text-secondary)]">
                        {formatMoney(row.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={row.status} />
                          {row.lastError ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 px-0 py-0"
                              onClick={() => setErrorTransaction(row)}
                              title={errorPreviewTitle(row.lastError)}
                              aria-label="View failure reason"
                            >
                              <AlertTriangle
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              ⋯
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => setDetailsTransaction(row)}
                            >
                              View details
                            </DropdownMenuItem>
                            {canEditItems(row.status) ? (
                              <DropdownMenuItem
                                onSelect={() => setEditingTransaction(row)}
                                className="gap-2"
                              >
                                <Pencil
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                Edit items
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onSelect={() =>
                                copyValue('Transaction ID', row.id)
                              }
                              className="gap-2"
                            >
                              <Copy className="h-4 w-4" aria-hidden="true" />
                              Copy transaction ID
                            </DropdownMenuItem>
                            {row.posReference ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  copyValue(
                                    'POS reference',
                                    row.posReference ?? '',
                                  )
                                }
                                className="gap-2"
                              >
                                <Copy className="h-4 w-4" aria-hidden="true" />
                                Copy POS reference
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onSelect={() => copySupportBundle(row)}
                              className="gap-2"
                            >
                              <FileText
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              Copy support bundle
                            </DropdownMenuItem>
                            {row.lastError ? (
                              <DropdownMenuItem
                                onSelect={() => setErrorTransaction(row)}
                              >
                                View error
                              </DropdownMenuItem>
                            ) : null}
                            {canRetryFiscalization(row.status) ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setConfirmAction({
                                    type: 'retry',
                                    transaction: row,
                                  })
                                }
                                className="gap-2"
                              >
                                <RotateCcw
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                Retry fiscalization
                              </DropdownMenuItem>
                            ) : null}
                            {canSendNow(row.status) ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setConfirmAction({
                                    type: 'send_now',
                                    transaction: row,
                                  })
                                }
                                className="gap-2"
                              >
                                <Send className="h-4 w-4" aria-hidden="true" />
                                Send now
                              </DropdownMenuItem>
                            ) : null}
                            {canFiscalize(row.status) ? (
                              <DropdownMenuItem
                                onSelect={() => setFiscalizeTransaction(row)}
                              >
                                Fiscalize
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <ToastViewport>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} variant={toast.variant}>
            {toast.message}
          </ToastItem>
        ))}
      </ToastViewport>

      <NonFiscalizedDetailsSheet
        transaction={detailsTransaction}
        onClose={() => setDetailsTransaction(null)}
        onViewError={(txn) => setErrorTransaction(txn)}
        onCopy={copyValue}
        onRetry={(txn) => setConfirmAction({ type: 'retry', transaction: txn })}
        onSendNow={(txn) =>
          setConfirmAction({ type: 'send_now', transaction: txn })
        }
        onCopySupportBundle={copySupportBundle}
        decimals={decimals}
      />
      <TransactionLinesEditorSheet
        open={Boolean(editingTransaction)}
        transactionId={editingTransaction?.id ?? null}
        products={products}
        decimals={decimals}
        csrfToken={csrfToken}
        onClose={() => setEditingTransaction(null)}
        showToast={showToast}
        onSaved={(result) => {
          const transactionId = String(
            result?.transactionId ?? editingTransaction?.id ?? '',
          )
          if (transactionId) {
            applyUpdatedTransaction(transactionId, {
              totalAmount: Number(result?.totalAmount ?? 0),
              fuelType:
                Number(result?.lineCount ?? 0) > 1
                  ? 'Mixed sale'
                  : (editingTransaction?.fuelType ?? null),
              volume:
                Number(result?.lineCount ?? 0) > 1
                  ? null
                  : (editingTransaction?.volume ?? null),
            })
          }
          setEditingTransaction(null)
        }}
      />
      <NonFiscalizedFiscalizeSheet
        transaction={fiscalizeTransaction}
        stationCountry={stationCountry}
        csrfToken={csrfToken}
        onClose={() => setFiscalizeTransaction(null)}
        onSuccess={handleFiscalize}
        buyerTypeOptions={buyerTypeOptions}
        showToast={showToast}
        decimals={decimals}
      />

      <TransactionErrorDialog
        open={Boolean(errorTransaction)}
        title="Fiscalization error"
        description="This is the last recorded error for the transaction."
        errorText={errorTransaction?.lastError ?? ''}
        onOpenChange={(open) => !open && setErrorTransaction(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'retry'
            ? 'Retry fiscalization?'
            : 'Send transaction now?'
        }
        description={
          confirmAction?.type === 'retry'
            ? 'This will re-queue the FAILED transaction for fiscalization and clear the last recorded error.'
            : 'This will push the transaction into the fiscalization flow immediately.'
        }
        confirmText={confirmAction?.type === 'retry' ? 'Retry' : 'Send now'}
        confirmVariant={
          confirmAction?.type === 'retry' ? 'secondary' : 'primary'
        }
        loading={confirmLoading}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return
          if (confirmAction.type === 'retry')
            return runRetry(confirmAction.transaction)
          return runSendNow(confirmAction.transaction)
        }}
      />
    </TransactionsUIContext.Provider>
  )
}

export default NonFiscalizedTransactionsPageClient
