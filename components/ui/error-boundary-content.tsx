'use client'

import { useEffect } from 'react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'
import { logger } from '@/src/shared/utils/logger'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export type ErrorBoundaryContentProps = {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  fallbackMessage?: string
}

export function ErrorBoundaryContent({
  error,
  reset,
  title = 'Something went wrong',
  fallbackMessage = 'An unexpected error occurred.',
}: ErrorBoundaryContentProps) {
  useEffect(() => {
    logger.error('[error-boundary]', { error })
  }, [error])

  return (
    <div className="space-y-4">
      <Alert variant={STATUS_VARIANT.ERROR} title={title}>
        <p>{error?.message ?? fallbackMessage}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        </div>
      </Alert>
    </div>
  )
}
