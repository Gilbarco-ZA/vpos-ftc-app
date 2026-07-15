'use client'

import { useEffect, useState } from 'react'

import PosIntegrationSettings from '@/components/admin/integrations/PosIntegrationSettings'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'
import { Skeleton } from '@/components/ui/skeleton'

import { AutoPrintReceiptsForm } from './AutoPrintReceiptsForm'
import { DecimalSettingsForm } from './DecimalSettingsForm'
import { LinkingWindowForm } from './LinkingWindowForm'

type AdminSettings = {
  linking_window_seconds?: number | null
  money_decimals?: number | null
  volume_decimals?: number | null
  unit_price_decimals?: number | null
  auto_print_receipts?: boolean | null
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading station settings">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {[0, 1, 2].map((item) => (
        <Card key={item}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-10 w-full max-w-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function AdminSettingsClient() {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        const response = await fetch('/api/admin/settings', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = (await response.json().catch(() => ({}))) as {
          data?: AdminSettings
        }
        if (!response.ok) throw body
        setSettings(body.data ?? {})
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  if (isLoading) return <SettingsSkeleton />

  const linkingWindowSeconds =
    typeof settings?.linking_window_seconds === 'number'
      ? settings.linking_window_seconds
      : null
  const decimalSettings = {
    money:
      typeof settings?.money_decimals === 'number'
        ? settings.money_decimals
        : null,
    volume:
      typeof settings?.volume_decimals === 'number'
        ? settings.volume_decimals
        : null,
    unitPrice:
      typeof settings?.unit_price_decimals === 'number'
        ? settings.unit_price_decimals
        : null,
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Station settings"
        description="Configure station behavior and integrations."
      />

      {loadError ? (
        <ErrorDetails
          title="Unable to load station settings"
          message="Check your connection and try again."
          error={loadError}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Linking window</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            The linking window determines how long we wait to capture a TIN
            before auto-fiscalizing without buyer information.
          </p>
          <LinkingWindowForm currentSeconds={linkingWindowSeconds} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt decimal places</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Control how many decimal places are shown for money totals, unit
            prices, and volumes across printed receipts and previews.
          </p>
          <DecimalSettingsForm currentDecimals={decimalSettings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt printing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Control whether receipts print automatically after fiscalization.
          </p>
          <AutoPrintReceiptsForm
            enabled={settings?.auto_print_receipts === true}
          />
        </CardContent>
      </Card>

      <PosIntegrationSettings />
    </div>
  )
}
