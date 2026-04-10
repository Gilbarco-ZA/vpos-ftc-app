import type { ToastMessage, ToastVariant } from '@/components/ui/toast'
import { useCallback, useState } from 'react'

export function useToasts(ttlMs = 4000) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, variant, message }])
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        ttlMs,
      )
    },
    [ttlMs],
  )

  return { toasts, showToast }
}
