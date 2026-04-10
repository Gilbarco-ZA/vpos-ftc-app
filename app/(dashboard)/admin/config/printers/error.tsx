'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function PrintersError({
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
      fallbackMessage="Unable to load printer configuration."
    />
  )
}
