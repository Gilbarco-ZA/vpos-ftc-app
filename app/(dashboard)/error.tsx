'use client'

import { useEffect } from 'react'

import { logger } from '@/src/shared/utils/logger'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface error in console for local troubleshooting
    logger.error('[dashboard-error]', { error })
  }, [error])

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Something went wrong</CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            The application hit an unexpected error while loading this page.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-card border border-border bg-surface-card p-3 text-sm">
            <div className="text-[var(--text-muted)]">Error</div>
            <div className="break-all font-mono">{error.message}</div>
            {error.digest ? (
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Digest: <span className="font-mono">{error.digest}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => reset()}>
              Try again
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => (window.location.href = '/login')}
            >
              Go to login
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => (window.location.href = '/setup')}
            >
              Go to setup
            </Button>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            If this persists, check the server logs for the corresponding digest
            (or requestId where available).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
