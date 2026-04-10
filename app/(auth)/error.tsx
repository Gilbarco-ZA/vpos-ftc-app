'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import { logger } from '@/src/shared/utils/logger'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('[error-boundary]', { error })
  }, [error])

  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Unable to load</CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Something went wrong while loading the authentication page.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded bg-[var(--surface-card)] p-3 text-sm shadow-md shadow-slate-500">
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
            <Button asChild variant="secondary">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
