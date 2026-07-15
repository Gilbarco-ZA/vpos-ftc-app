'use client'

import type { BootstrapStatusPayload } from '@/src/modules/bootstrap/contracts/bootstrapStatus'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { StartupProgress } from '@/components/startup/startup-progress'
import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function HomeGate() {
  const router = useRouter()
  const [startupReady, setStartupReady] = useState(false)
  const [error, setError] = useState('')
  const markStartupReady = useCallback(() => setStartupReady(true), [])

  useEffect(() => {
    if (!startupReady) return
    const controller = new AbortController()

    const route = async () => {
      try {
        const [bootstrapResponse, sessionResponse] = await Promise.all([
          fetch('/api/bootstrap/status', {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/auth/session', {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ])
        const bootstrap =
          (await bootstrapResponse.json()) as BootstrapStatusPayload
        const session = await sessionResponse.json()

        if (!bootstrapResponse.ok)
          throw new Error('Unable to load application status')
        if (!bootstrap.isRegistered || Number(bootstrap.userCount || 0) === 0) {
          router.replace('/setup')
          return
        }
        const user = session?.data ?? session
        router.replace(user ? '/dashboard' : '/login')
      } catch (reason) {
        if (controller.signal.aborted) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to start application',
        )
      }
    }

    void route()
    return () => controller.abort()
  }, [router, startupReady])

  if (!startupReady) return <StartupProgress onReady={markStartupReady} />
  if (error)
    return (
      <div className="m-6 rounded-lg border p-4 text-sm text-red-600">
        {error}
      </div>
    )
  return <PageSkeleton rows={3} />
}
