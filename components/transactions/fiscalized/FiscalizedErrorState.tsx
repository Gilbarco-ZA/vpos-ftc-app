import { Card } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'

type FiscalizedErrorStateProps = {
  error: unknown
}

const FiscalizedErrorState = ({ error }: FiscalizedErrorStateProps) => (
  <Card className="p-6">
    <ErrorDetails
      title="We couldn’t load fiscalized transactions."
      message="Check your connection and try again."
      error={error}
    />
  </Card>
)

export default FiscalizedErrorState
