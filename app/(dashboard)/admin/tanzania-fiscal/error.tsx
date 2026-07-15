'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function TanzaniaFiscalError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <ErrorBoundaryContent
      title="Unable to load Tanzania fiscal setup"
      error={error}
      reset={reset}
    />
  )
}
