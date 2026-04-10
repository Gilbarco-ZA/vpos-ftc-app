'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function TankLevelsError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <ErrorBoundaryContent
      title="Tank levels"
      error={error}
      reset={reset}
      fallbackMessage="Unable to load tank levels."
    />
  )
}
