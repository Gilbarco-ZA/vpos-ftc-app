'use client'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const CustomersError = ({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) => {
  return (
    <div className="space-y-4">
      <Alert variant={STATUS_VARIANT.ERROR} title="Something went wrong">
        <p>{error?.message ?? 'Unable to load customers.'}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        </div>
      </Alert>
    </div>
  )
}

export default CustomersError
