'use client'

import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import type { FiscalizedTransactionListItem } from '@/src/shared/types/transactions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Copy, FileText } from 'lucide-react'

import { safeCopy } from '@/src/shared/utils/clipboard'
import { formatDate } from '@/src/shared/utils/dates'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import CreditNoteReceiptSheet from '@/components/transactions/CreditNoteReceiptSheet'
import FiscalizedErrorState from '@/components/transactions/fiscalized/FiscalizedErrorState'
import FiscalizedFiltersRow from '@/components/transactions/fiscalized/FiscalizedFiltersRow'
import StatusBadge from '@/components/transactions/StatusBadge'
import { buildFiscalizedSupportBundle } from '@/components/transactions/supportBundle'
import TransactionReceiptSheet from '@/components/transactions/TransactionReceiptSheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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

import { TransactionsStatusToggle } from './TransactionsStatusToggle'

export type { FiscalizedTransactionListItem }

type FiscalizedTransactionsPageClientProps = {
  initialTransactions: FiscalizedTransactionListItem[]
  error?: string | null
  decimals: DecimalSettings
}

const formatNumber = (value: number | null, digits = 2) => {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toFixed(digits)
}

const DetailsSheet = ({
  transaction,
  onClose,
  onCopySupportBundle,
  decimals,
}: {
  transaction: FiscalizedTransactionListItem | null
  onClose: () => void
  onCopySupportBundle: (tx: FiscalizedTransactionListItem) => void
  decimals: DecimalSettings
}) => (
  <Sheet
    open={Boolean(transaction)}
    onOpenChange={(open) => !open && onClose()}
  >
    <SheetContent side="right" className="flex h-dvh flex-col p-0">
      <SheetHeader className="px-6 pt-6">
        <SheetTitle>Transaction details</SheetTitle>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
        {transaction && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Transaction ID
                </div>
                <div className="font-medium text-[var(--text-primary)]">
                  {transaction.id}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  POS reference
                </div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.posReference ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Fiscalized at
                </div>
                <div className="text-[var(--text-secondary)]">
                  {formatDate(transaction.fiscalizedAt)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Pump</div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.pumpNumber}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Fuel type
                </div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.fuelType ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Volume</div>
                <div className="text-[var(--text-secondary)]">
                  {formatNumber(transaction.volume, decimals.volume)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Total amount
                </div>
                <div className="text-[var(--text-secondary)]">
                  {formatNumber(transaction.totalAmount, decimals.money)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Customer</div>
                <div className="text-[var(--text-secondary)]">
                  {transaction.buyerName || transaction.tin || '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="border-t bg-[var(--surface-card)] px-6 py-4">
        <SheetFooter>
          {transaction ? (
            <Button
              variant="secondary"
              onClick={() => onCopySupportBundle(transaction)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Copy support bundle
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </div>
    </SheetContent>
  </Sheet>
)

const FiscalStatusSheet = ({
  transaction,
  onClose,
  onCopySupportBundle,
}: {
  transaction: FiscalizedTransactionListItem | null
  onClose: () => void
  onCopySupportBundle: (tx: FiscalizedTransactionListItem) => void
}) => (
  <Sheet
    open={Boolean(transaction)}
    onOpenChange={(open) => !open && onClose()}
  >
    <SheetContent side="right" className="flex h-dvh flex-col p-0">
      <SheetHeader className="px-6 pt-6">
        <SheetTitle>Fiscal status</SheetTitle>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
        {transaction && (
          <div className="space-y-4">
            <div>
              <div className="text-xs text-[var(--text-muted)]">
                Fiscal reference
              </div>
              <div className="font-medium text-[var(--text-primary)]">
                {transaction.fiscalizationReference ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">
                Cloud transaction ID
              </div>
              <div className="text-[var(--text-secondary)]">
                {transaction.cloudTransactionId ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">Status</div>
              <StatusBadge status={transaction.status} />
            </div>
          </div>
        )}
      </div>
      <div className="border-t bg-[var(--surface-card)] px-6 py-4">
        <SheetFooter>
          {transaction ? (
            <Button
              variant="secondary"
              onClick={() => onCopySupportBundle(transaction)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Copy support bundle
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </div>
    </SheetContent>
  </Sheet>
)

const FiscalizedTransactionsPageClient = ({
  initialTransactions,
  error,
  decimals,
}: FiscalizedTransactionsPageClientProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentSearchParams = searchParams ?? new URLSearchParams()
  const [transactions, setTransactions] = useState(initialTransactions)
  const [loadError, setLoadError] = useState<unknown>(error ?? null)
  const [loading, setLoading] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [detailsTransaction, setDetailsTransaction] =
    useState<FiscalizedTransactionListItem | null>(null)
  const [statusTransaction, setStatusTransaction] =
    useState<FiscalizedTransactionListItem | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [enqueueError, setEnqueueError] = useState<{
    title: string
    message: string
    error: unknown
  } | null>(null)

  const [creditNoteTransaction, setCreditNoteTransaction] =
    useState<FiscalizedTransactionListItem | null>(null)
  const [creditReasonCode, setCreditReasonCode] = useState('')
  const [creditNotes, setCreditNotes] = useState('')
  const [isCreatingCreditNote, setIsCreatingCreditNote] = useState(false)
  const [creditNoteError, setCreditNoteError] = useState<unknown>(null)

  const [receiptTransactionId, setReceiptTransactionId] = useState<
    string | null
  >(null)
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false)
  const [creditNoteViewId, setCreditNoteViewId] = useState<string | null>(null)

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

  const copySupportBundle = async (
    transaction: FiscalizedTransactionListItem,
  ) => {
    const bundle = buildFiscalizedSupportBundle(transaction)
    const ok = await safeCopy(bundle)
    showToast(
      ok ? 'success' : 'error',
      ok ? 'Copied support bundle' : 'Copy failed',
    )
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ scope: 'fiscalized', limit: '200' })
      if (search.trim()) params.set('search', search.trim())
      if (customer.trim()) params.set('customer', customer.trim())
      if (fuelType) params.set('fuel', fuelType)
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
      const items = Array.isArray(payload?.items) ? payload.items : []
      const mapped = items.map((item: any) => ({
        id: String(item?.id ?? ''),
        fiscalizedAt: item?.fiscalized_at ?? item?.fiscalizedAt ?? null,
        transactionDateTime:
          item?.transaction_date_time ?? item?.transactionDateTime ?? null,
        posReference: item?.pos_reference ?? item?.posReference ?? null,
        cloudTransactionId:
          item?.cloud_transaction_id ?? item?.cloudTransactionId ?? null,
        pumpNumber: Number(item?.pump_number ?? item?.pumpNumber ?? 0),
        fuelType: item?.fuel_type ?? item?.fuelType ?? null,
        volume: item?.volume ?? null,
        totalAmount: Number(item?.total_amount ?? item?.totalAmount ?? 0),
        status: String(item?.status ?? ''),
        fiscalizationReference:
          item?.fiscalization_reference ?? item?.fiscalizationReference ?? null,
        buyerName: item?.buyer_name ?? item?.buyerName ?? null,
        tin: item?.tin ?? null,
      }))
      setTransactions(mapped)
    } catch (err: unknown) {
      setLoadError(err)
    } finally {
      setLoading(false)
    }
  }, [search, customer, fuelType, startDate, endDate])

  useEffect(() => {
    const t = window.setTimeout(() => {
      refresh()
    }, 400)
    return () => window.clearTimeout(t)
  }, [refresh])

  const handleViewReceipt = (
    row: FiscalizedTransactionListItem,
    print = false,
  ) => {
    if (!row.id) return
    const params = new URLSearchParams({
      status: 'fiscalized',
      view: 'receipt',
      transactionId: row.id,
    })
    if (print) params.set('print', '1')
    router.push(`/transactions?${params.toString()}`)
  }

  const handlePreviewReceipt = (
    row: FiscalizedTransactionListItem,
    opts?: { print?: boolean },
  ) => {
    if (!row.id) return
    setReceiptTransactionId(row.id)
    setReceiptAutoPrint(Boolean(opts?.print))
  }

  const handleRefetchReceipt = async (row: FiscalizedTransactionListItem) => {
    if (!row.id) return
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(row.id)}/receipt?refresh=1`,
        {
          cache: 'no-store',
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setEnqueueError({
          title: 'We couldn’t re-fetch this receipt.',
          message: 'Check your connection and try again.',
          error: res.ok ? body : { status: res.status, body },
        })
        return
      }
      showToast('success', 'Receipt refreshed')
    } catch (err: unknown) {
      setEnqueueError({
        title: 'We couldn’t re-fetch this receipt.',
        message: 'Check your connection and try again.',
        error: err,
      })
    }
  }

  const resetCreditNoteState = () => {
    setCreditReasonCode('')
    setCreditNotes('')
    setCreditNoteError(null)
    setIsCreatingCreditNote(false)
  }

  const openCreditNote = (row: FiscalizedTransactionListItem) => {
    resetCreditNoteState()
    setCreditNoteTransaction(row)
  }

  useEffect(() => {
    const view = currentSearchParams.get('view')
    const transactionId =
      currentSearchParams.get('transactionId')?.trim() || null
    if (view === 'credit-note' && transactionId) {
      setCreditNoteViewId(transactionId)
    }
  }, [currentSearchParams])

  const openCreditNoteViewer = (transactionId: string) => {
    const params = new URLSearchParams(currentSearchParams.toString())
    params.set('status', 'fiscalized')
    params.set('view', 'credit-note')
    params.set('transactionId', transactionId)
    router.push(`${pathname}?${params.toString()}`)
    setCreditNoteViewId(transactionId)
  }

  const closeCreditNoteViewer = () => {
    const params = new URLSearchParams(currentSearchParams.toString())
    params.delete('view')
    params.delete('transactionId')
    router.replace(`${pathname}?${params.toString()}`)
    setCreditNoteViewId(null)
  }

  const submitCreditNote = async () => {
    if (!creditNoteTransaction?.id) return
    setIsCreatingCreditNote(true)
    setCreditNoteError(null)
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(creditNoteTransaction.id)}/credit-note`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            csrf_token: csrfToken,
            transactionId: creditNoteTransaction.id,
            reason_code: creditReasonCode.trim() || undefined,
            notes: creditNotes.trim() || undefined,
          }),
        },
      )

      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setCreditNoteError(res.ok ? body : { status: res.status, body })
        setIsCreatingCreditNote(false)
        return
      }

      showToast('success', 'Credit note queued for fiscalization')
      setCreditNoteTransaction(null)
      resetCreditNoteState()
      await refresh()
    } catch (err: unknown) {
      setCreditNoteError(err)
    } finally {
      setIsCreatingCreditNote(false)
    }
  }

  const filteredTransactions = useMemo(() => transactions, [transactions])
  const formatVolume = useCallback(
    (value: number | null) => formatNumber(value, decimals.volume),
    [decimals.volume],
  )
  const formatMoney = useCallback(
    (value: number | null) => formatNumber(value, decimals.money),
    [decimals.money],
  )

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title="Fiscalized"
        description="Completed transactions and receipt operations"
        actions={
          <>
            <TransactionsStatusToggle active="fiscalized" />
            <Button
              variant="secondary"
              onClick={() =>
                router.push('/transactions?status=fiscalized&view=receipt')
              }
            >
              Receipt viewer
            </Button>
          </>
        }
      />
      <FiscalizedFiltersRow
        search={search}
        customer={customer}
        fuelType={fuelType}
        startDate={startDate}
        endDate={endDate}
        onSearchChange={setSearch}
        onCustomerChange={setCustomer}
        onFuelTypeChange={setFuelType}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onRefresh={refresh}
        loading={loading}
      />
      {loadError ? (
        <FiscalizedErrorState error={loadError} />
      ) : loading && filteredTransactions.length === 0 ? (
        <TableSkeleton
          rows={8}
          columns={8}
          showHeader={false}
          showFilters={false}
        />
      ) : filteredTransactions.length === 0 ? (
        <EmptyState
          title="No fiscalized transactions"
          description="Fiscalized transactions appear here once completed."
        />
      ) : (
        <div className="relative">
          {loading ? <LoadingOverlay label="Loading transactions…" /> : null}

          <div className="overflow-hidden rounded-card border border-border bg-surface-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fiscalized time</TableHead>
                  <TableHead>POS reference</TableHead>
                  <TableHead>Pump</TableHead>
                  <TableHead>Fuel type</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-[var(--text-muted)]">
                      {formatDate(row.fiscalizedAt)}
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
                    <TableCell className="text-[var(--text-secondary)]">
                      {row.buyerName || row.tin || '—'}
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
                          <DropdownMenuItem
                            onSelect={() => copyValue('Transaction ID', row.id)}
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
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            Copy support bundle
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setStatusTransaction(row)}
                          >
                            View fiscal status
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleViewReceipt(row)}
                          >
                            View receipt
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleViewReceipt(row, true)}
                          >
                            Print receipt
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handlePreviewReceipt(row)}
                          >
                            Preview receipt
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              handlePreviewReceipt(row, { print: true })
                            }
                          >
                            Preview &amp; print
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleRefetchReceipt(row)}
                          >
                            Re-fetch receipt
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onSelect={() => openCreditNote(row)}
                          >
                            Create credit note
                          </DropdownMenuItem>
                          {row.status.toUpperCase() === 'CREDITED' && (
                            <DropdownMenuItem
                              onSelect={() => openCreditNoteViewer(row.id)}
                            >
                              View credit note
                            </DropdownMenuItem>
                          )}
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
      <ToastViewport>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} variant={toast.variant}>
            {toast.message}
          </ToastItem>
        ))}
      </ToastViewport>
      <DetailsSheet
        transaction={detailsTransaction}
        onClose={() => setDetailsTransaction(null)}
        onCopySupportBundle={copySupportBundle}
        decimals={decimals}
      />
      <FiscalStatusSheet
        transaction={statusTransaction}
        onClose={() => setStatusTransaction(null)}
        onCopySupportBundle={copySupportBundle}
      />
      <Sheet
        open={Boolean(enqueueError)}
        onOpenChange={(open) => !open && setEnqueueError(null)}
      >
        <SheetContent side="right" className="flex h-dvh flex-col p-0">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>Receipt refresh</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {enqueueError && (
              <ErrorDetails
                title={enqueueError.title}
                message={enqueueError.message}
                error={enqueueError.error}
              />
            )}
          </div>
          <div className="border-t bg-[var(--surface-card)] px-6 py-4">
            <SheetFooter>
              <Button variant="secondary" onClick={() => setEnqueueError(null)}>
                Close
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(creditNoteTransaction)}
        onOpenChange={(open) => {
          if (!open) {
            setCreditNoteTransaction(null)
            resetCreditNoteState()
          }
        }}
      >
        <SheetContent side="right" className="flex h-dvh flex-col p-0">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>Create credit note</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {creditNoteTransaction ? (
              <Card className="p-4 text-sm">
                <div className="text-xs text-[var(--text-muted)]">
                  Original transaction
                </div>
                <div className="mt-1 font-medium text-[var(--text-primary)]">
                  {creditNoteTransaction.posReference ||
                    creditNoteTransaction.id}
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                  Amount {formatMoney(creditNoteTransaction.totalAmount)} · Pump{' '}
                  {creditNoteTransaction.pumpNumber}
                </div>
              </Card>
            ) : null}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Reason code (optional)
              </div>
              <Input
                value={creditReasonCode}
                onChange={(e) => setCreditReasonCode(e.target.value)}
                placeholder="e.g. RETURN, ERROR, CANCEL"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Notes (optional)
              </div>
              <Input
                value={creditNotes}
                onChange={(e) => setCreditNotes(e.target.value)}
                placeholder="Short operator note"
              />
            </div>

            {creditNoteError ? (
              <ErrorDetails
                title="We couldn’t create this credit note."
                message="Check the transaction status and try again."
                error={creditNoteError}
              />
            ) : null}
          </div>
          <div className="border-t bg-[var(--surface-card)] px-6 py-4">
            <SheetFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreditNoteTransaction(null)
                  resetCreditNoteState()
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={submitCreditNote}
                disabled={!csrfToken || isCreatingCreditNote}
                title={!csrfToken ? 'Loading security token…' : undefined}
              >
                {isCreatingCreditNote ? 'Creating…' : 'Create credit note'}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <TransactionReceiptSheet
        open={Boolean(receiptTransactionId)}
        transactionId={receiptTransactionId}
        autoPrint={receiptAutoPrint}
        csrfToken={csrfToken}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptTransactionId(null)
            setReceiptAutoPrint(false)
          }
        }}
      />
      <CreditNoteReceiptSheet
        open={Boolean(creditNoteViewId)}
        transactionId={creditNoteViewId}
        csrfToken={csrfToken}
        onOpenChange={(open) => {
          if (!open) closeCreditNoteViewer()
        }}
      />
    </div>
  )
}

export default FiscalizedTransactionsPageClient
