'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type StationStatus = {
  ok?: boolean
  success?: boolean
  data?: { hasConfig: boolean }
  error?: any
}

type SessionStatus = {
  data?: unknown
}

const TOAST_MESSAGE =
  'Station configuration is missing. Please run the setup wizard to configure this station.'

const SESSION_CHECK_INTERVAL_MS = 60_000

export const StationConfigGuard = () => {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!pathname) return

    let cancelled = false

    const ensureSession = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        const payload: SessionStatus = await response.json().catch(() => ({}))
        const user = payload?.data ?? null

        if (cancelled) return false
        if (!user) {
          router.replace('/login')
          return false
        }
        return true
      } catch {
        return true
      }
    }

    const ensureStationConfig = async () => {
      // Allow the setup wizard itself to render even if config is missing.
      if (pathname.startsWith('/admin/setup')) return

      try {
        const res = await fetch('/api/config/station-status', {
          cache: 'no-store',
        })
        const json: StationStatus = await res.json().catch(() => ({}) as any)
        const hasConfig = Boolean(json?.data?.hasConfig)

        if (cancelled) return
        if (!hasConfig) {
          const q = encodeURIComponent(TOAST_MESSAGE)
          router.replace(`/admin/setup?toast=${q}`)
        }
      } catch {
        // Silent: guard is best-effort; other pages will surface errors.
      }
    }

    const run = async () => {
      if (!(await ensureSession())) return
      await ensureStationConfig()
    }

    const onFocus = () => void run()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run()
    }

    void run()
    const intervalId = window.setInterval(() => void ensureSession(), SESSION_CHECK_INTERVAL_MS)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [pathname, router])

  return null
}
