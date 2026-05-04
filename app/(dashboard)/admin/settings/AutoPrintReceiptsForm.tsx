'use client'

import type { ToastVariant } from '@/components/ui/toast'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

export type AutoPrintReceiptsFormProps = {
  enabled: boolean
}

type ToastState = { message: string; variant: ToastVariant } | null

export const AutoPrintReceiptsForm = ({
  enabled,
}: AutoPrintReceiptsFormProps) => {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(enabled)
  const [toast, setToast] = useState<ToastState>(null)
  const clearTimer = useRef<number | null>(null)

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ message, variant })
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    if (!csrfToken || busy) return

    setBusy(true)
    try {
      const form = e.currentTarget
      const formData = new FormData(form)

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken,
        },
        body: formData,
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error ?? 'Failed to save receipt printing')
      }

      showToast('Receipt printing settings saved', 'success')
      router.refresh()
    } catch (err: any) {
      showToast(err?.message ?? String(err), 'error')
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
        <input type="hidden" name="autoPrintReceipts" value="0" />

        <FormField
          label="Auto-print fiscal receipts"
          helpText="When enabled, fiscalized transactions immediately enqueue a receipt print job."
        >
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              name="autoPrintReceipts"
              value="1"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              disabled={busy}
            />
            <span>Enable auto-printing after fiscalization</span>
          </label>
        </FormField>

        <div className="flex items-center justify-end">
          <Button type="submit" variant="primary" disabled={busy || !csrfToken}>
            {busy ? 'Saving…' : 'Save receipt printing'}
          </Button>
        </div>
      </form>
    </>
  )
}
