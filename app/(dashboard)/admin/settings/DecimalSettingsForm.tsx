'use client'

import type { ToastVariant } from '@/components/ui/toast'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ToastItem, ToastViewport } from '@/components/ui/toast'

export type DecimalSettingsFormProps = {
  currentDecimals: {
    money: number | null
    volume: number | null
    unitPrice: number | null
  }
}

type ToastState = { message: string; variant: ToastVariant } | null

export const DecimalSettingsForm = ({
  currentDecimals,
}: DecimalSettingsFormProps) => {
  const router = useRouter()
  const [csrfToken, setCsrfToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const clearTimer = useRef<number | null>(null)

  const describe = useMemo(
    () => (value: number | null | undefined) => {
      if (value == null) return 'Default: 2 decimal places.'
      return `Currently ${value} decimal place${value === 1 ? '' : 's'}.`
    },
    [],
  )

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
        throw new Error(json?.error ?? 'Failed to save decimal settings')
      }

      showToast('Decimal settings saved', 'success')
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

        <div className="space-y-4">
          <FormField
            label="Money decimal places"
            helpText={describe(currentDecimals.money)}
          >
            <Input
              name="moneyDecimals"
              type="number"
              min={0}
              max={3}
              step={1}
              placeholder="e.g., 2"
              defaultValue={currentDecimals.money ?? undefined}
              disabled={busy}
            />
          </FormField>
          <FormField
            label="Unit price decimal places"
            helpText={describe(currentDecimals.unitPrice)}
          >
            <Input
              name="unitPriceDecimals"
              type="number"
              min={0}
              max={3}
              step={1}
              placeholder="e.g., 2"
              defaultValue={currentDecimals.unitPrice ?? undefined}
              disabled={busy}
            />
          </FormField>
          <FormField
            label="Volume decimal places"
            helpText={describe(currentDecimals.volume)}
          >
            <Input
              name="volumeDecimals"
              type="number"
              min={0}
              max={3}
              step={1}
              placeholder="e.g., 2"
              defaultValue={currentDecimals.volume ?? undefined}
              disabled={busy}
            />
          </FormField>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit" variant="primary" disabled={busy || !csrfToken}>
            {busy ? 'Saving…' : 'Save decimal settings'}
          </Button>
        </div>
      </form>
    </>
  )
}
