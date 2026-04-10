import { requireAuth } from '@/src/shared/auth'

import TankGradesClient from './client'

export const dynamic = 'force-dynamic'

const TankGradesPage = async () => {
  const user = await requireAuth(['administrator', 'manager'])

  return (
    <div className="space-y-4">
      <TankGradesClient role={user.role} />
    </div>
  )
}

export default TankGradesPage
