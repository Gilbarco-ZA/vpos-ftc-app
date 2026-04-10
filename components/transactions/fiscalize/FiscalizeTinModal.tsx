'use client'

import { useEffect, useMemo, useState } from 'react'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type FiscalizeTinModalProps = {
  transactionId: string
  disabled?: boolean
}

export const FiscalizeTinModal = ({
  transactionId,
  disabled,
}: FiscalizeTinModalProps) => {
  const [open, setOpen] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  const titleId = useMemo(
    () => `fiscalize-title-${transactionId}`,
    [transactionId],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={
          disabled
            ? 'Only OPEN/ALLOCATED transactions can be queued'
            : 'Queue transaction for fiscalization'
        }
      >
        Send to fiscalization stack
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border bg-[var(--surface-card)] p-4 shadow-md shadow-slate-500"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id={titleId} className="text-sm font-semibold">
                  Capture TIN for fiscalization
                </h2>
                <p className="text-xs text-neutral-500">
                  Find or create a customer, then queue for fiscalization.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>

            <form
              action="/api/transactions/fiscalize"
              method="post"
              className="space-y-3"
            >
              <CsrfBootstrap onToken={setCsrfToken} />
              <CsrfHiddenInput token={csrfToken} />
              <input type="hidden" name="transactionId" value={transactionId} />

              <div className="space-y-1">
                <label className="text-xs text-neutral-500">TIN</label>
                <Input name="tin" placeholder="TIN" required />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">
                    Buyer name (if new)
                  </label>
                  <Input name="buyerName" placeholder="Buyer name" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">
                    Buyer type (optional)
                  </label>
                  <Input name="buyerType" placeholder="B2C" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">
                    Phone (optional)
                  </label>
                  <Input name="contactPhone" placeholder="+255..." />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">
                    Email (optional)
                  </label>
                  <Input name="contactEmail" placeholder="buyer@example.com" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">Odometer</label>
                  <Input name="odometer" placeholder="50000" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">
                    Payment type
                  </label>
                  <select
                    name="paymentType"
                    defaultValue="CASH"
                    className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-500">
                    Vehicle reg no.
                  </label>
                  <Input name="vehicleRegNr" placeholder="T123 ABC" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" variant="primary">
                  Queue transaction
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
