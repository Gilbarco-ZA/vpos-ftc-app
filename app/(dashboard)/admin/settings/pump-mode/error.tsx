'use client'

import { useEffect } from 'react'

import { logger } from '@/src/shared/utils/logger'

import { Button } from '@/components/ui/button'

const PumpModeError = ({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) => {
  useEffect(() => {
    logger.error('[error-boundary]', { error })
  }, [error])

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface-card p-6">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Unable to load pump mode
        </h2>
        <p className="text-xs text-[var(--text-muted)]">Please try again.</p>
      </div>
      <Button variant="secondary" onClick={reset}>
        Retry
      </Button>
    </div>
  )
}

export default PumpModeError
