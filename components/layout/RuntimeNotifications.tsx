'use client'

import type { ToastMessage, ToastVariant } from '@/components/ui/toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { ToastItem, ToastViewport } from '@/components/ui/toast'

type NotificationItem = {
  id: number
  receivedAt: string | null
  type: string
  transactionId: string | null
  pumpNumber: number | null
  amount: number | null
  error: string | null
  reference: string | null
}

const STORAGE_KEY = 'vpos.notifications.lastId'

const formatAmount = (value: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return null
  return Number(value).toLocaleString()
}

const formatId = (value: string | null) => {
  if (!value) return 'Unknown'
  return value.length > 8 ? `${value.slice(0, 8)}…` : value
}

const formatMessage = (item: NotificationItem) => {
  const shortId = formatId(item.transactionId)
  if (item.type === 'transactionCreated') {
    const amount = formatAmount(item.amount)
    return `Transaction created (${shortId})${amount ? ` • ${amount}` : ''}`
  }
  if (item.type === 'transactionFailed') {
    return `Transaction failed (${shortId})${item.error ? ` • ${item.error}` : ''}`
  }
  if (item.type === 'transactionFiscalized') {
    return `Transaction fiscalized (${shortId})`
  }
  return `Transaction update (${shortId})`
}

const variantFor = (item: NotificationItem): ToastVariant => {
  if (item.type === 'transactionFailed') return STATUS_VARIANT.ERROR
  if (item.type === 'transactionFiscalized') return STATUS_VARIANT.SUCCESS
  return STATUS_VARIANT.INFO
}

export const RuntimeNotifications = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [lastId, setLastId] = useState<number | null>(null)
  const readyRef = useRef(false)
  const timersRef = useRef<Record<string, number>>({})

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
    const timer = timersRef.current[id]
    if (timer) {
      window.clearTimeout(timer)
      delete timersRef.current[id]
    }
  }, [])

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, variant, message }])
      if (typeof window !== 'undefined') {
        timersRef.current[id] = window.setTimeout(() => {
          removeToast(id)
        }, 10_000)
      }
    },
    [removeToast],
  )

  const poll = useCallback(async (sinceId: number) => {
    const res = await fetch(
      `/api/notifications/transactions?sinceId=${sinceId}&limit=20`,
      { cache: 'no-store' },
    )
    if (!res.ok) throw new Error('Failed to fetch notifications')
    const data = await res.json()
    const items: NotificationItem[] = data?.data?.items ?? data?.items ?? []
    return items
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? Number.parseInt(stored, 10) : null
    queueMicrotask(() => setLastId(Number.isFinite(parsed) ? parsed : 0))
  }, [])

  useEffect(() => {
    if (lastId == null) return
    let cancelled = false

    const run = async () => {
      try {
        const items = await poll(lastId)
        if (cancelled) return

        if (!readyRef.current) {
          const maxId = items.reduce(
            (acc, item) => Math.max(acc, item.id),
            lastId,
          )
          setLastId(maxId)
          window.localStorage.setItem(STORAGE_KEY, String(maxId))
          readyRef.current = true
          return
        }

        if (items.length) {
          items.forEach((item) => {
            showToast(variantFor(item), formatMessage(item))
          })
          const maxId = items.reduce(
            (acc, item) => Math.max(acc, item.id),
            lastId,
          )
          setLastId(maxId)
          window.localStorage.setItem(STORAGE_KEY, String(maxId))
        }
      } catch {
        // Silent: notifications are best-effort
      }
    }

    run()
    const timer = window.setInterval(run, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [lastId, poll, showToast])

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => {
        window.clearTimeout(timer)
      })
      timersRef.current = {}
    }
  }, [])

  const visibleToasts = useMemo(() => toasts, [toasts])

  return (
    <ToastViewport>
      {visibleToasts.map((toast) => (
        <ToastItem
          key={toast.id}
          variant={toast.variant}
          onClick={() => removeToast(toast.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                removeToast(toast.id)
              }}
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        </ToastItem>
      ))}
    </ToastViewport>
  )
}
