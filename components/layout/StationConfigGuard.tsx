'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type StationStatus = {
  ok?: boolean
  success?: boolean
  data?: { hasConfig: boolean }
  error?: any
}

const TOAST_MESSAGE =
  'Station configuration is missing. Please run the setup wizard to configure this station.'

export const StationConfigGuard = () => {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Allow the setup wizard itself to render even if config is missing
    if (!pathname) return
    if (pathname.startsWith('/admin/setup')) return

    let cancelled = false

    const run = async () => {
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
        // Silent: guard is best-effort; other pages will surface errors
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return null
}
