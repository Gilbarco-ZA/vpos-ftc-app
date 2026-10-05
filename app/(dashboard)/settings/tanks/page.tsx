import { requireAuth } from '@/src/shared/auth'

import TankSettingsClient from './client'

export const dynamic = 'force-dynamic'

const SettingsTanksPage = async () => {
  await requireAuth(['administrator', 'manager', 'field_engineer'])

  return (
    <div className="space-y-4">
      <TankSettingsClient />
    </div>
  )
}

export default SettingsTanksPage
