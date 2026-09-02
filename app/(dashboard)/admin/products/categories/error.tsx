'use client'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ProductCategoriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <Alert variant={STATUS_VARIANT.ERROR} title="Unable to load categories">
      <p>
        {error.message || 'The product categories page could not be loaded.'}
      </p>
      <div className="mt-4">
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </Alert>
  )
}
