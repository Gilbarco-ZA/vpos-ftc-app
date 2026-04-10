import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'

type NonFiscalizedErrorStateProps = {
  error: unknown
  onRetry: () => void
}

const NonFiscalizedErrorState = ({
  error,
  onRetry,
}: NonFiscalizedErrorStateProps) => (
  <Card className="p-6">
    <ErrorDetails
      title="We couldn’t load transactions right now."
      message="Check your connection and try again."
      error={error}
    />
    <div className="mt-4">
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  </Card>
)

export default NonFiscalizedErrorState
