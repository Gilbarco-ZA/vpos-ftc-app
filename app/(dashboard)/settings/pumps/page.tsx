import { requireAuth } from '@/src/shared/auth'

import PumpSettingsClient from './client'

export const dynamic = 'force-dynamic'

const SettingsPumpsPage = async () => {
  const user = await requireAuth(['administrator', 'manager'])

  return (
    <div className="space-y-4">
      <PumpSettingsClient stationId={user.stationId} />
    </div>
  )
}

export default SettingsPumpsPage
