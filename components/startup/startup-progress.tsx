'use client'

import type { StartupStatus } from '@/src/platform/bootstrap/startup-status'
import { useEffect, useState } from 'react'

export function StartupProgress({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<StartupStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const response = await fetch('/api/startup/status', {
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok)
          throw new Error(
            payload?.error?.message || 'Unable to read startup status',
          )
        if (!active) return
        const next = payload.data as StartupStatus
        setStatus(next)
        setError('')
        if (next.phase === 'ready' || next.phase === 'degraded') {
          onReady()
          return
        }
      } catch (reason) {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to read startup status',
        )
      }
      timer = setTimeout(poll, 1000)
    }

    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [onReady])

  const progress = Math.max(0, Math.min(100, status?.progress ?? 0))

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <section className="bg-card w-full max-w-xl rounded-xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Starting VPOS</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The web application is available while station data is prepared.
        </p>
        <div className="bg-muted mt-6 h-3 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="font-medium">
            {status?.message ?? 'Reading startup status'}
          </span>
          <span>{progress}%</span>
        </div>
        {status?.detail ? (
          <p className="text-muted-foreground mt-2 text-sm">{status.detail}</p>
        ) : null}
        {status?.importResult ? (
          <p className="text-muted-foreground mt-4 text-xs">
            Imported{' '}
            {Object.values(status.importResult.inserted).reduce(
              (a, b) => a + b,
              0,
            )}{' '}
            records; moved{' '}
            {Object.values(status.importResult.moved).reduce(
              (a, b) => a + b,
              0,
            )}{' '}
            files; warnings {status.importResult.warnings}.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  )
}
