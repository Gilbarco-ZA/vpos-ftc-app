'use client'

import type { NormalizedReceipt } from '@/src/shared/receipts/normalizeReceipt'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { safeCopy } from '@/src/shared/utils/clipboard'

import Receipt80mm from '@/components/receipts/Receipt80mm'
import ReceiptPreview from '@/components/receipts/ReceiptPreview'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ErrorDetails } from '@/components/ui/error-details'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export type TransactionReceiptSheetProps = {
  open: boolean
  transactionId: string | null
  title?: string
  autoPrint?: boolean
  csrfToken?: string
  onOpenChange: (open: boolean) => void
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

export const TransactionReceiptSheet = ({
  open,
  transactionId,
  title = 'Receipt preview',
  autoPrint,
  csrfToken,
  onOpenChange,
}: TransactionReceiptSheetProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [receipt, setReceipt] = useState<NormalizedReceipt | null>(null)
  const [raw, setRaw] = useState<any>(null)
  const [voided, setVoided] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<any>(null)
  const autoPrintStartedFor = useRef<string | null>(null)

  const canFetch = Boolean(open && transactionId)

  const fetchReceipt = useCallback(
    async (refresh?: boolean) => {
      if (!transactionId) return
      setLoading(true)
      setError(null)
      setReceipt(null)
      setRaw(null)
      setVoided(false)
      try {
        const params = new URLSearchParams({ transactionId })
        if (refresh) params.set('refresh', '1')
        const res = await fetch(`/api/receipts?${params.toString()}`, {
          cache: 'no-store',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.ok === false) {
          setError(res.ok ? body : { status: res.status, body })
          return
        }
        setReceipt(body?.receipt ?? null)
        setRaw(body?.raw ?? null)
        setVoided(!!body?.voided)
      } catch (err: unknown) {
        setError(err)
      } finally {
        setLoading(false)
      }
    },
    [transactionId],
  )

  useEffect(() => {
    if (!canFetch) return
    fetchReceipt()
  }, [canFetch, fetchReceipt])

  const printReceipt = useCallback(async () => {
    if (!transactionId) return false
    if (!csrfToken) {
      setPrintError({ message: 'Security token not ready' })
      return false
    }

    setPrinting(true)
    setPrintError(null)
    try {
      const res = await fetch('/api/receipts/print', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          transactionId,
          isReprint: true,
        }),
      })
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

  useEffect(() => {
    if (!open || !transactionId) {
      autoPrintStartedFor.current = null
      return
    }
  }, [open, transactionId])

  useEffect(() => {
    if (!open || !autoPrint || !receipt || !transactionId || !csrfToken) return
    if (autoPrintStartedFor.current === transactionId) return
    autoPrintStartedFor.current = transactionId
    void printReceipt()
  }, [open, autoPrint, receipt, transactionId, csrfToken, printReceipt])

  const rawText = useMemo(() => toText(raw), [raw])

  const copySupportBundle = async () => {
    if (!transactionId) return
    const bundle = [
      '=== Receipt support bundle ===',
      `Transaction ID: ${transactionId}`,
      rawText ? '' : undefined,
      rawText ? '--- Raw fiscalization response ---' : undefined,
      rawText ? rawText : undefined,
    ]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join('\n')

    const ok = await safeCopy(bundle)
    setCopied(ok ? 'Copied support bundle' : 'Copy failed')
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-dvh flex-col p-0">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>{title}</SheetTitle>
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
              Loading receipt…
            </div>
          ) : error ? (
            <ErrorDetails
              title="We couldn’t load this receipt."
              message="Try refreshing the receipt data or check your connection."
              error={error}
            />
          ) : receipt ? (
            <div className="space-y-4">
              {voided && (
                <Alert variant={STATUS_VARIANT.ERROR} title="VOIDED">
                  This receipt has been voided by a credit note.
                </Alert>
              )}
              {printError && (
                <Alert
                  variant={STATUS_VARIANT.ERROR}
                  title="Receipt print failed"
                >
                  JPL did not accept the receipt print request.
                </Alert>
              )}
              <div className="rounded-card border border-border bg-surface-card p-4">
                <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-[var(--text-muted)]">
                    Transaction:{' '}
                    <span className="font-medium">{transactionId}</span>
                    {copied ? (
                      <span className="ml-2 text-[var(--text-secondary)]">
                        • {copied}
                      </span>
                    ) : null}
                  </div>
                  <div className="no-print flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={copySupportBundle}
                      className="gap-2"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      Copy support
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => fetchReceipt(true)}
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void printReceipt()}
                      disabled={!csrfToken || printing}
                      title={!csrfToken ? 'Loading security token…' : undefined}
                    >
                      {printing ? 'Printing…' : 'Print via JPL'}
                    </Button>
                  </div>
                </div>
                <Receipt80mm receipt={receipt} />
              </div>
              {rawText ? (
                <ReceiptPreview
                  title="Raw fiscalization response"
                  subtitle="Useful for support/debugging"
                  text={rawText}
                />
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              Receipt not available.
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

export default TransactionReceiptSheet
