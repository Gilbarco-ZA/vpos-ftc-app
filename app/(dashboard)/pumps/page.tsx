import { requireAuth } from '@/src/shared/auth'

import { PumpsRolePage } from '@/components/pumps/PumpsRolePage'

export const dynamic = 'force-dynamic'

const PumpsPage = async () => {
  const user = await requireAuth(['manager', 'administrator'])

  return (
    <PumpsRolePage
      role={user.role === 'administrator' ? 'administrator' : 'manager'}
      stationId={user.stationId}
    />
  )
}

export default PumpsPage
