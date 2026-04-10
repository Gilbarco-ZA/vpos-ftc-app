import { requireAuth } from '@/src/shared/auth'

import TankLevelsPageClient from '@/components/tank-levels/TankLevelsPageClient'

export const dynamic = 'force-dynamic'

const TankLevelsPage = async () => {
  const user = await requireAuth(['manager', 'administrator'])
  const createdByName = user.fullName || user.username || user.email

  return <TankLevelsPageClient createdByName={createdByName} />
}

export default TankLevelsPage
