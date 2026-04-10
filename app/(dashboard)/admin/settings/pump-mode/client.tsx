'use client'

import type { ActionStatus } from '@/src/shared/status/ui'
import { useCallback, useEffect, useState } from 'react'

import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Skeleton } from '@/components/ui/skeleton'

type PumpModeResponse = {
  availablePumps: number[]
  selectedPumps: number[]
}

type StatusMessage = {
  type: ActionStatus
  message: string
}

export default function PumpModeClient() {
  const [csrfToken, setCsrfToken] = useState('')
  const [availablePumps, setAvailablePumps] = useState<number[]>([])
  const [selectedPumps, setSelectedPumps] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/settings/pump-mode', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as {
        data?: PumpModeResponse
      }
      if (!res.ok) throw body
      setAvailablePumps(body?.data?.availablePumps ?? [])
      setSelectedPumps(body?.data?.selectedPumps ?? [])
    } catch (err) {
      setLoadError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const togglePump = (pumpNumber: number, checked: boolean) => {
    setSelectedPumps((prev) => {
      if (checked)
        return Array.from(new Set([...prev, pumpNumber])).sort((a, b) => a - b)
      return prev.filter((value) => value !== pumpNumber)
    })
  }

  const saveConfig = async () => {
    setStatus(null)
    setIsSaving(true)
    try {
      const res = await fetch('/api/settings/pump-mode', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          data: { selectedPumps },
          csrf_token: csrfToken,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body

      setSelectedPumps(body?.data?.selectedPumps ?? selectedPumps)
      setStatus({ type: ACTION_STATUS.SUCCESS, message: 'Pump mode updated.' })
    } catch (err: any) {
      const message =
        err?.error?.message || err?.message || 'Failed to save pump mode.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title="Pump Mode"
        description="Select pumps that should skip attendant authorization."
        actions={
          <Button variant="primary" onClick={saveConfig} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        }
      />

      {status && (
        <Card>
          <CardContent>
            <div
              className={
                status.type === ACTION_STATUS.SUCCESS
                  ? 'text-sm text-emerald-700'
                  : 'text-sm text-red-600'
              }
            >
              {status.message}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : loadError ? (
            <ErrorDetails
              title="Unable to load pump mode"
              message="Please retry."
              error={loadError}
            />
          ) : availablePumps.length === 0 ? (
            <EmptyState
              title="No pumps available"
              description="Create pumps first, then configure pump mode."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {availablePumps.map((pump) => {
                const active = selectedPumps.includes(pump)
                return (
                  <label
                    key={pump}
                    className="flex items-center justify-between rounded-card border border-border bg-surface-card px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        Pump {pump}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Skip attendant auth
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          active
                            ? STATUS_VARIANT.SUCCESS
                            : STATUS_VARIANT.NEUTRAL
                        }
                      >
                        {active ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant={active ? 'secondary' : 'primary'}
                        aria-pressed={active}
                        onClick={() => togglePump(pump, !active)}
                      >
                        {active ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
