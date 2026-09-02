'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function MaintenanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundaryContent
      error={error}
      reset={reset}
      fallbackMessage="Unable to load maintenance status."
    />
  )
}
