'use client'

import type { BootstrapStatusPayload } from '@/src/modules/bootstrap/contracts/bootstrapStatus'
import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { StartupProgress } from '@/components/startup/startup-progress'
import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function StartupGate() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')
  const [routing, setRouting] = useState(false)

  const continueAfterStartup = useCallback(async () => {
    if (routing) return
    setRouting(true)
    setError('')

    try {
      const requestedNext = searchParams.get('next')
      if (requestedNext === '/setup') {
        router.replace('/setup')
        return
      }

      const [bootstrapResponse, sessionResponse] = await Promise.all([
        fetch('/api/bootstrap/status', { cache: 'no-store' }),
        fetch('/api/auth/session', { cache: 'no-store' }),
      ])

      const bootstrap =
        (await bootstrapResponse.json()) as BootstrapStatusPayload
      const session = await sessionResponse.json()

      if (!bootstrapResponse.ok) {
        throw new Error('Unable to load application status')
      }

      if (!bootstrap.isRegistered || Number(bootstrap.userCount || 0) === 0) {
        router.replace('/setup')
        return
      }

      const user = session?.data ?? session
      router.replace(user ? '/dashboard' : '/login')
    } catch (reason) {
      setRouting(false)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to continue application startup',
      )
    }
  }, [router, routing, searchParams])

  if (routing) return <PageSkeleton rows={3} />

  return (
    <>
      <StartupProgress onReady={continueAfterStartup} />
      {error ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-3rem)] max-w-xl -translate-x-1/2 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)] shadow-lg">
          {error}
        </div>
      ) : null}
    </>
  )
}
