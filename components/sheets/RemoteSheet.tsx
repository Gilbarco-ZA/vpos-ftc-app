import { ReactNode, useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { SheetFooter } from '@/components/ui/sheet'

import { RightSheet } from './RightSheet'

export function useRemoteResource<T>(
  openKey: string | null,
  buildUrl: (key: string) => string,
  options?: { parse?: (body: any) => T; auto?: boolean },
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [data, setData] = useState<T | null>(null)

  const fetchData = useCallback(async () => {
    if (!openKey) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(buildUrl(openKey), { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ status: res.status, body })
        return
      }
      const parsed = options?.parse ? options.parse(body) : (body?.data ?? body)
      setData(parsed as T)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [openKey, buildUrl, options?.parse])

  useEffect(() => {
    const auto = options?.auto ?? true
    if (!auto || !openKey) return
    fetchData()
  }, [openKey, fetchData, options?.auto])

  return { loading, error, data, refetch: fetchData }
}

export function RemoteSheet({
  open,
  onClose,
  title,
  onPrimary,
  primaryLabel,
  children,
  onRetry,
}: {
  open: boolean
  onClose: () => void
  title: string
  onPrimary?: () => void
  primaryLabel?: string
  children: ReactNode
  onRetry: () => void
}) {
  return (
    <RightSheet open={open} onClose={onClose} title={title}>
      <div className="mt-4">
        {children}
        <SheetFooter className="mt-4">
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
          {onPrimary && primaryLabel && (
            <Button variant="secondary" onClick={onPrimary}>
              {primaryLabel}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </div>
    </RightSheet>
  )
}
