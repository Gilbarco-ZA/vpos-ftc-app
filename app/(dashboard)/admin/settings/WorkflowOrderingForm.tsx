'use client'

import type { ToastVariant } from '@/components/ui/toast'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Select } from '@/components/ui/select'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

export type WorkflowOrderingFormProps = {
  printReceiptOrder: 'before_fiscalization' | 'after_fiscalization'
  tinCaptureOrder: 'before_transaction' | 'after_transaction'
}

type ToastState = { message: string; variant: ToastVariant } | null

export function WorkflowOrderingForm({
  printReceiptOrder,
  tinCaptureOrder,
}: WorkflowOrderingFormProps) {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [printOrder, setPrintOrder] = useState(printReceiptOrder)
  const [tinOrder, setTinOrder] = useState(tinCaptureOrder)
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
        throw new Error(body?.error?.message ?? 'Failed to save workflow settings')
      }
      showToast('Transaction workflow settings saved', 'success')
      router.refresh()
    } catch (error: any) {
      showToast(error?.message ?? String(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {toast ? (
        <ToastViewport>
          <ToastItem variant={toast.variant}>{toast.message}</ToastItem>
        </ToastViewport>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <CsrfBootstrap onToken={setCsrfToken} />
        <CsrfHiddenInput token={csrfToken} />

        <FormField
          label="Print receipt order"
          helpText="Before fiscalization prints an offline receipt first. After fiscalization prints the completed fiscal receipt. Auto-print must be enabled below."
        >
          <Select
            name="printReceiptOrder"
            value={printOrder}
            onChange={(event) =>
              setPrintOrder(
                event.target.value as WorkflowOrderingFormProps['printReceiptOrder'],
              )
            }
            disabled={busy}
          >
            <option value="after_fiscalization">After fiscalization</option>
            <option value="before_fiscalization">Before fiscalization</option>
          </Select>
        </FormField>

        <FormField
          label="TIN capture order"
          helpText="Before pump transaction requires the tenant to select a customer and nozzle before dispensing. After pump transaction keeps the current linking-window allocation flow."
        >
          <Select
            name="tinCaptureOrder"
            value={tinOrder}
            onChange={(event) =>
              setTinOrder(
                event.target.value as WorkflowOrderingFormProps['tinCaptureOrder'],
              )
            }
            disabled={busy}
          >
            <option value="after_transaction">After pump transaction</option>
            <option value="before_transaction">Before pump transaction</option>
          </Select>
        </FormField>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || !csrfToken}>
            {busy ? 'Saving…' : 'Save transaction workflow'}
          </Button>
        </div>
      </form>
    </>
  )
}
