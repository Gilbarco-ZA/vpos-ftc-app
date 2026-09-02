'use client'

import type { BootstrapStatusPayload } from '@/src/modules/bootstrap/contracts/bootstrapStatus'
import { useCallback, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { StartupProgress } from '@/components/startup/startup-progress'
import { Button } from '@/components/ui/button'

const ROUTING_TIMEOUT_MS = 15_000

async function fetchStartupJson(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

export default function StartupGate() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const routingRef = useRef(false)
  const [error, setError] = useState('')
  const [routing, setRouting] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const continueAfterStartup = useCallback(async () => {
    if (routingRef.current) return

    routingRef.current = true
    setRouting(true)
    setError('')

    try {
      const requestedNext = searchParams.get('next')
      if (requestedNext === '/setup') {
        router.replace('/setup')
        return
      }

      const [bootstrapResult, sessionResult] = await Promise.all([
        fetchStartupJson('/api/bootstrap/status'),
        fetchStartupJson('/api/auth/session'),
      ])

      const bootstrap = bootstrapResult.payload as BootstrapStatusPayload | null
      if (!bootstrapResult.response.ok || !bootstrap) {
        throw new Error(
          bootstrapResult.payload?.error?.message ||
            'Unable to load application bootstrap status',
        )
      }

      if (!bootstrap.isRegistered || Number(bootstrap.userCount || 0) === 0) {
        router.replace('/setup')
        return
      }

      if (!sessionResult.response.ok) {
        throw new Error(
          sessionResult.payload?.error?.message ||
            'Unable to load the current session',
        )
      }

      const user = sessionResult.payload?.data ?? sessionResult.payload
      router.replace(user ? '/dashboard' : '/login')
    } catch (reason) {
      routingRef.current = false
      setRouting(false)
      setError(
        reason instanceof DOMException && reason.name === 'AbortError'
          ? 'Application routing timed out. Check the bootstrap and session APIs, then retry.'
          : reason instanceof Error
            ? reason.message
            : 'Unable to continue application startup',
      )
    }
  }, [router, searchParams])

  const retry = () => {
    routingRef.current = false
    setRouting(false)
    setError('')
    setRetryKey((value) => value + 1)
  }

  return (
    <>
      <StartupProgress
        key={retryKey}
        onReady={continueAfterStartup}
        transitioning={routing}
      />
      {error ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-3rem)] max-w-xl -translate-x-1/2 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)] shadow-lg">
          <p>{error}</p>
          <Button className="mt-3" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : null}
    </>
  )
}
