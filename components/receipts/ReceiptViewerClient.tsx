'use client'

import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { printReceiptAndWait } from '@/src/shared/receipts/printReceiptClient'
import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { formatDate } from '@/src/shared/utils/dates'
import { formatNumber } from '@/src/shared/utils/format'

import { PageHeader } from '@/components/layout/page-header'
import Receipt80mm from '@/components/receipts/Receipt80mm'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableSkeleton } from '@/components/ui/table-skeleton'

type TransactionListItem = {
  id: string
  receiptNumber: string | null
  cloudTransactionId: string | null
  fiscalizationReference: string | null
  fiscalizedAt: string | null
  amount: number
  pumpNumber: number
  fuelType: string | null
  customer: string | null
}

type ReceiptViewerClientProps = {
  initialQuery?: string
  initialTransactionId?: string
  autoPrint?: boolean
  title?: string
  description?: string
  backHref?: string | null
  backLabel?: string
  alwaysShowResultsList?: boolean
  initialFromDate?: string
  initialToDate?: string
  businessDate?: string
}

const ReceiptViewerClient = ({
  initialQuery,
  initialTransactionId,
  autoPrint,
  title = 'Receipt viewer',
  description = 'Search for fiscalized receipts and print them instantly.',
  backHref = '/transactions?status=fiscalized',
  backLabel = 'Back to fiscalized',
  alwaysShowResultsList = false,
  initialFromDate = '',
  initialToDate = '',
  businessDate = '',
}: ReceiptViewerClientProps) => {
  const router = useRouter()
  const [search, setSearch] = useState(initialQuery || '')
  const [fromDate, setFromDate] = useState(initialFromDate)
  const [toDate, setToDate] = useState(initialToDate)
  const [results, setResults] = useState<TransactionListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTransactionId || null,
  )
  const [receipt, setReceipt] = useState<NormalizedReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [receiptError, setReceiptError] = useState<unknown>(null)
  const [csrfToken, setCsrfToken] = useState('')
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<unknown>(null)
  const [printSuccess, setPrintSuccess] = useState(false)
  const autoPrintStartedFor = useRef<string | null>(null)
  const [voided, setVoided] = useState(false)

  const fetchResults = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ scope: 'fiscalized', limit: '100' })
      if (search.trim()) params.set('search', search.trim())
      if (fromDate) params.set('startDate', fromDate)
      if (toDate) params.set('endDate', toDate)

      const res = await fetch(`/api/transactions?${params.toString()}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setError(res.ok ? body : { status: res.status, body })
        return
      }
      const payload = body?.data ?? body
      const items = Array.isArray(payload?.items) ? payload.items : []
      const mapped = items.map((item: any) => ({
        id: String(item?.id ?? ''),
        receiptNumber: item?.receipt_number ?? item?.receiptNumber ?? null,
        cloudTransactionId:
          item?.cloud_transaction_id ?? item?.cloudTransactionId ?? null,
        fiscalizationReference:
          item?.fiscalization_reference ?? item?.fiscalizationReference ?? null,
        fiscalizedAt: item?.fiscalized_at ?? item?.fiscalizedAt ?? null,
        amount: Number(item?.total_amount ?? item?.totalAmount ?? 0),
        pumpNumber: Number(item?.pump_number ?? item?.pumpNumber ?? 0),
        fuelType: item?.fuel_type ?? item?.fuelType ?? null,
        customer: item?.buyer_name ?? item?.tin ?? null,
      }))
      setResults(mapped)
      if (mapped.length === 1) {
        setSelectedId(mapped[0].id)
      }
    } catch (err: unknown) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [search, fromDate, toDate])

  const fetchReceipt = useCallback(
    async (transactionId: string, refresh?: boolean) => {
      if (!transactionId) return
      setReceiptError(null)
      setReceipt(null)
      setReceiptLoading(true)
      setVoided(false)

      try {
        const params = new URLSearchParams({ transactionId })
        if (refresh) params.set('refresh', '1')
        const res = await fetch(`/api/receipts?${params.toString()}`, {
          cache: 'no-store',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.ok === false) {
          setReceiptError(res.ok ? body : { status: res.status, body })
          return
        }
        setReceipt(body?.receipt ?? null)
        setVoided(!!body?.voided)
      } catch (err: unknown) {
        setReceiptError(err)
      } finally {
        setReceiptLoading(false)
      }
    },
    [],
  )

  const printReceipt = useCallback(
    async (transactionId: string, isReprint = true) => {
      if (!csrfToken) {
        setPrintError({ message: 'Security token not ready' })
        setPrintSuccess(false)
        return false
      }

      setPrinting(true)
      setPrintError(null)
      setPrintSuccess(false)
      try {
        const result = await printReceiptAndWait({
          csrfToken,
          transactionId,
          isReprint,
        })
        if (!result.success) {
          setPrintError(result.error ?? { message: 'Receipt print failed' })
          return false
        }
        setPrintSuccess(true)
        window.setTimeout(() => setPrintSuccess(false), 3000)
        return true
      } catch (err: unknown) {
        setPrintError(err)
        return false
      } finally {
        setPrinting(false)
      }
    },
    [csrfToken],
  )

  useEffect(() => {
    queueMicrotask(() => {
      fetchResults()
    })
  }, [fetchResults])

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedId) {
        fetchReceipt(selectedId)
      }
    })
  }, [selectedId, fetchReceipt])

  useEffect(() => {
    if (!autoPrint || !receipt || !selectedId || !csrfToken) return
    if (autoPrintStartedFor.current === selectedId) return
    autoPrintStartedFor.current = selectedId
    queueMicrotask(() => {
      void printReceipt(selectedId, true)
    })
  }, [autoPrint, receipt, selectedId, csrfToken, printReceipt])

  const selected = useMemo(
    () => results.find((row) => row.id === selectedId) || null,
    [results, selectedId],
  )
  const showInitialResultsLoading = loading && results.length === 0
  const shouldShowResultsList =
    results.length > 0 && (alwaysShowResultsList || results.length > 1)

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title={title}
        description={description}
        actions={
          backHref ? (
            <Button variant="secondary" onClick={() => router.push(backHref)}>
              {backLabel}
            </Button>
          ) : undefined
        }
      />
      <div className="no-print flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface-card px-4 py-3">
        <div className="min-w-[240px] flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search receipt number, cloud ID, or fiscal reference"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <span className="text-xs text-[var(--text-muted)]">to</span>
          <Input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={fetchResults} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setFromDate(businessDate)
            setToDate(businessDate)
          }}
          disabled={!businessDate}
        >
          Today
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setFromDate('')
            setToDate('')
          }}
        >
          All dates
        </Button>
      </div>

      {error ? (
        <Card className="p-6">
          <ErrorDetails
            title="We couldn’t load receipts."
            message="Check your connection and try again."
            error={error}
          />
        </Card>
      ) : showInitialResultsLoading ? (
        <TableSkeleton
          rows={6}
          columns={6}
          showHeader={false}
          showFilters={false}
        />
      ) : results.length === 0 ? (
        <EmptyState
          title="No receipts found"
          description="Try a different receipt number or adjust your date range."
        />
      ) : shouldShowResultsList ? (
        <div className="relative">
          {loading ? <LoadingOverlay label="Searching receipts…" /> : null}
          <div className="overflow-hidden rounded-card border border-border bg-surface-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fiscalized</TableHead>
                  <TableHead>Receipt number</TableHead>
                  <TableHead>Pump</TableHead>
                  <TableHead>Fuel</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-[var(--text-muted)]">
                      {formatDate(row.fiscalizedAt)}
                    </TableCell>
                    <TableCell>{row.receiptNumber ?? '—'}</TableCell>
                    <TableCell>{row.pumpNumber}</TableCell>
                    <TableCell>{row.fuelType ?? '—'}</TableCell>
                    <TableCell>{formatNumber(row.amount)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            ⋯
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setSelectedId(row.id)}
                          >
                            Open receipt
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {selectedId && (
        <div className="space-y-4">
          <div className="no-print flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="primary"
              onClick={() => void printReceipt(selectedId, true)}
              disabled={!csrfToken || printing}
              title={!csrfToken ? 'Loading security token…' : undefined}
            >
              {printing ? 'Printing…' : 'Print via JPL'}
            </Button>
          </div>

          {printSuccess ? (
            <Alert
              variant={STATUS_VARIANT.SUCCESS}
              title="Receipt printed successfully"
            >
              The printer confirmed the receipt print job completed.
            </Alert>
          ) : null}

          {printError ? (
            <Alert variant={STATUS_VARIANT.ERROR} title="Receipt print failed">
              The receipt print job did not complete successfully. Review the{' '}
              <Link href="/admin/config/printers">station printer settings</Link>{' '}
              and the print runtime.
            </Alert>
          ) : null}

          {receiptError ? (
            <Card className="p-6">
              <ErrorDetails
                title="Receipt unavailable"
                message="The receipt could not be loaded. Try refreshing it or re-fetching the fiscal response."
                error={receiptError}
              />
            </Card>
          ) : receipt ? (
            <div className="space-y-3">
              {voided && (
                <Alert variant={STATUS_VARIANT.ERROR} title="VOIDED">
                  This receipt has been voided by a credit note.
                </Alert>
              )}
              {receipt.meta.offlinePending ? (
                <Alert
                  variant={STATUS_VARIANT.WARN}
                  title="Offline receipt / pending fiscalization"
                >
                  This transaction has not been fiscalized yet. Print only as an
                  offline acknowledgement and retry fiscalization when the proxy
                  or internet connection is available.
                </Alert>
              ) : null}
              <div className="no-print">
                <div className="text-sm text-[var(--text-muted)]">
                  Receipt #{receipt.meta.receiptNumber ?? '—'} •{' '}
                  {selected?.receiptNumber ?? selectedId}
                </div>
              </div>
              <Receipt80mm receipt={receipt} />
            </div>
          ) : receiptLoading ? (
            <Card className="p-6">
              <div className="space-y-3">
                <div className="h-4 w-32 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-4 w-48 animate-pulse rounded-xl bg-gray-200" />
                <div className="space-y-2 rounded-card border border-border bg-surface-card p-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-4 animate-pulse rounded-xl bg-gray-200"
                    />
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="text-sm text-[var(--text-muted)]">
                Select a receipt to preview.
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default ReceiptViewerClient
