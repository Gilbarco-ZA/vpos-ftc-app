import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'
import { getStationSettings } from '@/src/shared/settings/station'

import { PageHeader } from '@/components/layout/page-header'
import TinAllocationClient from '@/components/transactions/TinAllocationClient'

export const dynamic = 'force-dynamic'

export default async function TinAllocationPage() {
  const user = await requireAuth(['tenant'])
  const settings = await getStationSettings(user.stationId)
  if (settings?.tin_capture_order !== 'before_transaction') {
    redirect('/transactions')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="TIN allocation"
        description="Select a customer, then allocate their TIN/PIN to a specific pump nozzle before dispensing."
      />
      <TinAllocationClient />
    </div>
  )
}
