'use client'

import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Copy } from 'lucide-react'

import { safeCopy } from '@/src/shared/utils/clipboard'
import { formatDate } from '@/src/shared/utils/dates'
import { formatNumber } from '@/src/shared/utils/format'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import CreditNoteReceiptSheet from '@/components/transactions/CreditNoteReceiptSheet'
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
import {
  ToastItem,
  ToastMessage,
  ToastVariant,
  ToastViewport,
} from '@/components/ui/toast'

export type ManagerFiscalizedRow = {
  id: string
  fiscalizedAt: string | null
  receiptNumber: string | null
  pumpNumber: number
  totalAmount: number
  buyerName: string | null
  tin: string | null
  fiscalizationReference: string | null
  status: string | null
}

export default function FiscalizedTransactionsManagerClient(props: {
  rows: ManagerFiscalizedRow[]
  prevHref: string
  nextHref: string
  decimals: DecimalSettings
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentSearchParams = useMemo(
    () => searchParams ?? new URLSearchParams(),
    [searchParams],
  )
  const [csrfToken, setCsrfToken] = useState('')
  const [creditNoteViewId, setCreditNoteViewId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const [creditNoteTransaction, setCreditNoteTransaction] =
    useState<ManagerFiscalizedRow | null>(null)
  const [creditReasonCode, setCreditReasonCode] = useState('')
  const [creditNotes, setCreditNotes] = useState('')
  const [isCreatingCreditNote, setIsCreatingCreditNote] = useState(false)
  const [creditNoteError, setCreditNoteError] = useState<unknown>(null)
  const formatMoney = (value: number | null) =>
    formatNumber(value, props.decimals.money)

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

  const resetCreditNoteState = () => {
    setCreditReasonCode('')
    setCreditNotes('')
    setCreditNoteError(null)
    setIsCreatingCreditNote(false)
  }

  const openCreditNote = (row: ManagerFiscalizedRow) => {
    resetCreditNoteState()
    setCreditNoteTransaction(row)
  }

  useEffect(() => {
    const view = currentSearchParams.get('view')
    const transactionId =
      currentSearchParams.get('transactionId')?.trim() || null
    if (view === 'credit-note' && transactionId) {
      queueMicrotask(() => setCreditNoteViewId(transactionId))
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
      router.refresh()
    } catch (err: unknown) {
      setCreditNoteError(err)
    } finally {
      setIsCreatingCreditNote(false)
    }
  }

  const openReceiptViewer = (row: ManagerFiscalizedRow) => {
    const params = new URLSearchParams({
      status: 'fiscalized',
      view: 'receipt',
      transactionId: row.id,
    })
    router.push(`/transactions?${params.toString()}`)
  }

  return (
    <>
      <CsrfBootstrap onToken={setCsrfToken} />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date/Time</TableHead>
              <TableHead>Pump</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>TIN</TableHead>
              <TableHead>Receipt number</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-[var(--text-secondary)]">
                  {formatDate(t.fiscalizedAt)}
                </TableCell>
                <TableCell>{t.pumpNumber}</TableCell>
                <TableCell className="text-[var(--text-secondary)]">
                  {formatMoney(t.totalAmount)}
                </TableCell>
                <TableCell className="text-[var(--text-secondary)]">
                  {t.buyerName || '—'}
                </TableCell>
                <TableCell className="text-[var(--text-muted)]">
                  {t.tin || '—'}
                </TableCell>
                <TableCell className="text-[var(--text-muted)]">
                  {t.receiptNumber || '—'}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openReceiptViewer(t)}>
                        View receipt
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openCreditNote(t)}>
                        Create credit note
                      </DropdownMenuItem>
                      {(t.status || '').toUpperCase() === 'CREDITED' && (
                        <DropdownMenuItem
                          onSelect={() => openCreditNoteViewer(t.id)}
                        >
                          View credit note
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => copyValue('Transaction ID', t.id)}
                        className="gap-2"
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        Copy transaction ID
                      </DropdownMenuItem>
                      {t.receiptNumber ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            copyValue('Receipt number', t.receiptNumber ?? '')
                          }
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Copy receipt number
                        </DropdownMenuItem>
                      ) : null}
                      {t.fiscalizationReference ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            copyValue(
                              'Fiscal reference',
                              t.fiscalizationReference ?? '',
                            )
                          }
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Copy fiscal reference
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="mt-2 break-all text-xs text-[var(--text-muted)]">
                    {t.id}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {props.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8">
                  <EmptyState
                    title="No fiscalized transactions"
                    description="Try a different receipt number or adjust the page."
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <Button asChild variant="secondary" size="sm">
            <Link href={props.prevHref}>Previous</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={props.nextHref}>Next</Link>
          </Button>
        </div>
      </Card>

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
                  {creditNoteTransaction.receiptNumber ||
                    creditNoteTransaction.fiscalizationReference ||
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

      <ToastViewport>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} variant={toast.variant}>
            {toast.message}
          </ToastItem>
        ))}
      </ToastViewport>

      <CreditNoteReceiptSheet
        open={Boolean(creditNoteViewId)}
        transactionId={creditNoteViewId}
        csrfToken={csrfToken}
        onOpenChange={(open) => {
          if (!open) closeCreditNoteViewer()
        }}
      />
    </>
  )
}
