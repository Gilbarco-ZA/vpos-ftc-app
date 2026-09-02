'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function StockError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <ErrorBoundaryContent
      title="Product stock"
      error={error}
      reset={reset}
      fallbackMessage="Unable to load product stock."
    />
  )
}
