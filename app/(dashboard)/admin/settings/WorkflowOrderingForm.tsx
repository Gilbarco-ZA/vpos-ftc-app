'use client'

import type { ToastVariant } from '@/components/ui/toast'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

export type WorkflowOrderingFormProps = {
  printReceiptOrder: 'before_fiscalization' | 'after_fiscalization'
  tinCaptureOrder: 'before_transaction' | 'after_transaction'
  linkingWindowSeconds: number | null
  autoPrintReceipts: boolean
}

type ToastState = { message: string; variant: ToastVariant } | null

export function WorkflowOrderingForm({
  printReceiptOrder,
  tinCaptureOrder,
  linkingWindowSeconds,
  autoPrintReceipts,
}: WorkflowOrderingFormProps) {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [printOrder, setPrintOrder] = useState(printReceiptOrder)
  const [tinOrder, setTinOrder] = useState(tinCaptureOrder)
  const [autoPrint, setAutoPrint] = useState(autoPrintReceipts)
  const [toast, setToast] = useState<ToastState>(null)
  const clearTimer = useRef<number | null>(null)

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ message, variant })
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!csrfToken || busy) return

    setBusy(true)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: new FormData(event.currentTarget),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? 'Failed to save workflow settings',
        )
      }
      showToast('Transaction workflow settings saved', 'success')
      router.refresh()
    } catch (error: any) {
      showToast(error?.message ?? String(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const linkingWindowHelp =
    tinOrder === 'before_transaction'
      ? 'How long the captured customer allocation for the selected pump/nozzle remains valid while waiting for dispensing. Set to 0 to keep it active until used or cancelled.'
      : 'How long a completed pump transaction remains pending for customer/TIN allocation before it becomes eligible for fiscalization. Set to 0 to disable the timeout.'

  return (
    <>
      {toast ? (
        <ToastViewport>
          <ToastItem variant={toast.variant}>{toast.message}</ToastItem>
        </ToastViewport>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <CsrfBootstrap onToken={setCsrfToken} />
        <CsrfHiddenInput token={csrfToken} />
        <input type="hidden" name="autoPrintReceipts" value="0" />

        <FormField
          label="TIN capture order"
          helpText="Choose whether the customer/TIN is allocated before dispensing or linked to the completed pump transaction afterwards."
        >
          <Select
            name="tinCaptureOrder"
            value={tinOrder}
            onChange={(event) =>
              setTinOrder(
                event.target
                  .value as WorkflowOrderingFormProps['tinCaptureOrder'],
              )
            }
            disabled={busy}
          >
            <option value="after_transaction">After pump transaction</option>
            <option value="before_transaction">Before pump transaction</option>
          </Select>
        </FormField>

        <FormField
          label="Linking window (seconds)"
          helpText={linkingWindowHelp}
        >
          <Input
            name="linkingWindowSeconds"
            type="number"
            min={0}
            max={3600}
            step={1}
            placeholder="e.g., 30"
            defaultValue={linkingWindowSeconds ?? undefined}
            disabled={busy}
          />
        </FormField>

        <div className="border-t border-[var(--border-subtle)] pt-5">
          <div className="space-y-4">
            <FormField
              label="Automatic receipt printing"
              helpText="Enable automatic receipt printing for completed transactions."
            >
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Checkbox
                  name="autoPrintReceipts"
                  value="1"
                  checked={autoPrint}
                  onChange={(event) => setAutoPrint(event.target.checked)}
                  disabled={busy}
                />
                <span>Enable automatic receipt printing</span>
              </label>
            </FormField>

            <FormField
              label="Print receipt order"
              helpText="Before fiscalization uses the offline receipt path and requires the print job to complete before fiscalization. After fiscalization prints the completed fiscal receipt."
            >
              <Select
                name="printReceiptOrder"
                value={printOrder}
                onChange={(event) =>
                  setPrintOrder(
                    event.target
                      .value as WorkflowOrderingFormProps['printReceiptOrder'],
                  )
                }
                disabled={busy || !autoPrint}
              >
                <option value="after_fiscalization">After fiscalization</option>
                <option value="before_fiscalization">
                  Before fiscalization
                </option>
              </Select>
            </FormField>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || !csrfToken}>
            {busy ? 'Saving…' : 'Save transaction workflow'}
          </Button>
        </div>
      </form>
    </>
  )
}
