import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Info,
  XCircle,
} from 'lucide-react'

import {
  transactionStatusLabel,
  transactionStatusVariant,
} from '@/components/transactions/transactionStatus'
import { Badge } from '@/components/ui/badge'

const StatusIcon = ({
  variant,
}: {
  variant: ReturnType<typeof transactionStatusVariant>
}) => {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
    case 'warn':
      return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    case 'error':
      return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
    case 'info':
      return <Info className="h-3.5 w-3.5" aria-hidden="true" />
    default:
      return <Circle className="h-3.5 w-3.5" aria-hidden="true" />
  }
}

export const StatusBadge = ({
  status,
  className,
}: {
  status: string
  className?: string
}) => {
  const variant = transactionStatusVariant(status)
  const label = transactionStatusLabel(status)

  return (
    <Badge
      variant={variant}
      className={['inline-flex items-center gap-1', className]
        .filter(Boolean)
        .join(' ')}
    >
      <StatusIcon variant={variant} />
      <span>{label}</span>
    </Badge>
  )
}

export default StatusBadge
