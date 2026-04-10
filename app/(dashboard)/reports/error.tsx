'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function ReportsError({
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
      fallbackMessage="Unable to load reports."
    />
  )
}
