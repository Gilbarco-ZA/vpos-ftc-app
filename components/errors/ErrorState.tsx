import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from '../ui/button'
import { Card } from '../ui/card'

export const ErrorState = ({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) => (
  <Card className="animate-fade-in p-6">
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
        <AlertTriangle className="h-5 w-5 text-red-400" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          {message}
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  </Card>
)
