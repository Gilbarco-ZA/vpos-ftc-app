'use client'

import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import Receipt80mm from '@/components/receipts/Receipt80mm'
import ReceiptPreview from '@/components/receipts/ReceiptPreview'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorDetails } from '@/components/ui/error-details'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export type CreditNoteReceiptSheetProps = {
  open: boolean
  transactionId: string | null
  csrfToken?: string
  onOpenChange: (open: boolean) => void
}

type CreditNoteInfo = {
  id: string
  status: string
  reasonCode: string | null
  notes: string | null
  lastError: string | null
  createdAt: string | null
}

const toText = (raw: any) => {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
}

const statusVariant = (status: string) => {
  switch (status.toUpperCase()) {
    case 'SENT':
      return 'success' as const
    case 'FAILED':
      return 'error' as const
    default:
      return 'info' as const
  }
}

export const CreditNoteReceiptSheet = ({
  open,
  transactionId,
  csrfToken,
  onOpenChange,
}: CreditNoteReceiptSheetProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [receipt, setReceipt] = useState<NormalizedReceipt | null>(null)
  const [raw, setRaw] = useState<any>(null)
  const [creditNote, setCreditNote] = useState<CreditNoteInfo | null>(null)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<any>(null)

  const canFetch = Boolean(open && transactionId)

  const fetchCreditNote = useCallback(async () => {
    if (!transactionId) return
    setLoading(true)
    setError(null)
    setReceipt(null)
    setRaw(null)
    setCreditNote(null)
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(transactionId)}/credit-note`,
        { cache: 'no-store' },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setError(res.ok ? body : { status: res.status, body })
        return
      }
      const data = body?.data ?? body
      setReceipt(data?.receipt ?? null)
      setRaw(data?.raw ?? null)
      setCreditNote(data?.creditNote ?? null)
    } catch (err: unknown) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [transactionId])

  useEffect(() => {
    if (!canFetch) return
    fetchCreditNote()
  }, [canFetch, fetchCreditNote])

  const printReceipt = useCallback(async () => {
    if (!transactionId) return false
    if (!csrfToken) {
      setPrintError({ message: 'Security token not ready' })
      return false
    }

    setPrinting(true)
    setPrintError(null)
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(transactionId)}/credit-note/print`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            csrf_token: csrfToken,
            isReprint: true,
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setPrintError(res.ok ? body : { status: res.status, body })
        return false
      }
      return true
    } catch (err: unknown) {
      setPrintError(err)
      return false
    } finally {
      setPrinting(false)
    }
  }, [csrfToken, transactionId])

  const rawText = useMemo(() => toText(raw), [raw])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-dvh flex-col p-0">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Credit note</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!transactionId ? (
            <ErrorDetails
              title="Transaction ID missing"
              message="Select a transaction and try again."
              error={{ message: 'No transactionId provided' }}
            />
          ) : loading ? (
            <div className="text-sm text-[var(--text-muted)]">
              Loading credit note…
            </div>
          ) : error ? (
            <ErrorDetails
              title="We couldn't load this credit note."
              message="The credit note may still be pending or the connection failed."
              error={error}
            />
          ) : (
            <div className="space-y-4">
              {printError && (
                <Alert
                  variant={STATUS_VARIANT.ERROR}
                  title="Receipt print failed"
                >
                  JPL did not accept the credit note receipt print request.
                </Alert>
              )}

              {creditNote && (
                <div className="rounded-card border border-border bg-surface-card p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">
                      Credit note status
                    </span>
                    <Badge variant={statusVariant(creditNote.status)}>
                      {creditNote.status}
                    </Badge>
                  </div>
                  {creditNote.reasonCode && (
                    <div className="mt-2">
                      <span className="text-xs text-[var(--text-muted)]">
                        Reason code:{' '}
                      </span>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {creditNote.reasonCode}
                      </span>
                    </div>
                  )}
                  {creditNote.notes && (
                    <div className="mt-1">
                      <span className="text-xs text-[var(--text-muted)]">
                        Notes:{' '}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {creditNote.notes}
                      </span>
                    </div>
                  )}
                  {creditNote.lastError && (
                    <Alert variant={STATUS_VARIANT.ERROR} className="mt-2">
                      {creditNote.lastError}
                    </Alert>
                  )}
                </div>
              )}

              {receipt ? (
                <div className="space-y-4">
                  <div className="rounded-card border border-border bg-surface-card p-4">
                    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-[var(--text-muted)]">
                        Transaction:{' '}
                        <span className="font-medium">{transactionId}</span>
                      </div>
                      <div className="no-print flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => fetchCreditNote()}
                        >
                          Refresh
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => void printReceipt()}
                          disabled={!csrfToken || printing}
                          title={
                            !csrfToken ? 'Loading security token…' : undefined
                          }
                        >
                          {printing ? 'Printing…' : 'Print via JPL'}
                        </Button>
                      </div>
                    </div>
                    <Receipt80mm receipt={receipt} />
                  </div>
                  {rawText ? (
                    <ReceiptPreview
                      title="Raw credit note response"
                      subtitle="Useful for support/debugging"
                      text={rawText}
                    />
                  ) : null}
                </div>
              ) : creditNote?.status === 'PENDING' ? (
                <Alert variant={STATUS_VARIANT.WARN} title="PENDING">
                  This credit note is still being processed. The receipt will be
                  available once fiscalization completes.
                </Alert>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">
                  Credit note receipt not available.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t bg-[var(--surface-card)] px-6 py-4">
          <SheetFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CreditNoteReceiptSheet
