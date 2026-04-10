'use client'

import { ErrorBoundaryContent } from '@/components/ui/error-boundary-content'

export default function BrandingError({
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
      fallbackMessage="Unable to load branding settings."
    />
  )
}
