import { requireAuth } from '@/src/shared/auth'

import { RoleDashboardHome } from '@/components/dashboard/RoleDashboardHome'

export const dynamic = 'force-dynamic'

const DashboardHome = async () => {
  const user = await requireAuth()

  const role =
    user.role === 'administrator'
      ? 'administrator'
      : user.role === 'manager'
        ? 'manager'
        : 'tenant'

  return <RoleDashboardHome role={role} />
}

export default DashboardHome
