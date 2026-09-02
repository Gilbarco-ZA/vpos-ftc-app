'use client'

import { FormEvent, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

type Props = {
  action?: string
  defaultIncludeTankStatus?: boolean
  onComplete?: () => void
  showForce?: boolean
  showTankStatus?: boolean
}

export const ForecourtSyncButton = ({
  action = '/api/admin/forecourt-sync/run',
  defaultIncludeTankStatus = true,
  onComplete,
  showForce = true,
  showTankStatus = true,
}: Props) => {
  const [force, setForce] = useState(false)
  const [includeTankStatus, setIncludeTankStatus] = useState(
    defaultIncludeTankStatus,
  )
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<{
    message: string
    status: 'error' | 'success'
  } | null>(null)

  const runSync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsRunning(true)
    setResult(null)

    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force, includeTankStatus }),
      })
      const body = await response.json().catch(() => ({}))

      if (!response.ok || body?.success === false) {
        const message =
          typeof body?.error === 'string'
            ? body.error
            : (body?.error?.message ?? body?.message)
        throw new Error(
          String(message ?? `Forecourt refresh failed (${response.status})`),
        )
      }

      const counts = body?.data?.counts ?? body?.counts
      const summary = counts
        ? [
            `${counts.products ?? 0} products`,
            `${counts.tanks ?? 0} tanks`,
            `${counts.pumps ?? 0} pumps`,
            `${counts.nozzles ?? 0} nozzles`,
          ].join(', ')
        : null

      setResult({
        status: 'success',
        message: summary
          ? `Forecourt configuration refreshed: ${summary}.`
          : 'Forecourt configuration refreshed successfully.',
      })
      onComplete?.()
    } catch (error: any) {
      setResult({
        status: 'error',
        message: String(error?.message ?? 'Forecourt refresh failed.'),
      })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <form onSubmit={runSync} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {showTankStatus && (
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={includeTankStatus}
              onChange={(event) => setIncludeTankStatus(event.target.checked)}
              disabled={isRunning}
            />
            Include tank status
          </label>
        )}

        {showForce && (
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              disabled={isRunning}
            />
            Force (override lock)
          </label>
        )}
      </div>

      <Button type="submit" variant="primary" disabled={isRunning}>
        <RefreshCw
          className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        {isRunning ? 'Refreshing forecourt' : 'Refresh forecourt data'}
      </Button>

      {result && (
        <div
          role={result.status === 'error' ? 'alert' : 'status'}
          className={
            result.status === 'error'
              ? 'rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]'
              : 'rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-text)]'
          }
        >
          {result.message}
        </div>
      )}
    </form>
  )
}
