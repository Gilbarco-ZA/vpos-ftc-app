import { redirect } from 'next/navigation'

import { queryOne } from '@/src/platform/db/postgres'
import { requireAuth } from '@/src/shared/auth'

import PosIntegrationSettings from '@/components/admin/integrations/PosIntegrationSettings'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorDetails } from '@/components/ui/error-details'

import { DecimalSettingsForm } from './DecimalSettingsForm'
import { LinkingWindowForm } from './LinkingWindowForm'

export const dynamic = 'force-dynamic'

const loadSettings = async (stationId: string) => {
  const row = await queryOne<any>(
    `SELECT * FROM station_settings WHERE station_id = $1`,
    [stationId],
  )
  return row
}

const AdminSettingsPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  let row: any = null
  let loadError: unknown = null

  try {
    const settings = await loadSettings(user.stationId)
    row = settings ?? null
  } catch (err) {
    loadError = err
  }

  const linkingWindowSeconds =
    typeof row?.linking_window_seconds === 'number'
      ? row.linking_window_seconds
      : null

  const decimalSettings = {
    money: typeof row?.money_decimals === 'number' ? row.money_decimals : null,
    volume:
      typeof row?.volume_decimals === 'number' ? row.volume_decimals : null,
    unitPrice:
      typeof row?.unit_price_decimals === 'number'
        ? row.unit_price_decimals
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

      <PosIntegrationSettings />
    </div>
  )
}

export default AdminSettingsPage
