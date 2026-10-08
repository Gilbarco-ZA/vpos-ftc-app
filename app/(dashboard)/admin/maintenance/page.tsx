import { redirect } from 'next/navigation'

import { getAdminForecourtSyncStatus } from '@/src/modules/forecourt/application/getAdminForecourtSyncStatus'
import { requireAuth } from '@/src/shared/auth'

import { MaintenanceClient } from './MaintenanceClient'

export const dynamic = 'force-dynamic'

const AdminMaintenancePage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  const forecourtStatus = { data: await getAdminForecourtSyncStatus(user.stationId) }

  return <MaintenanceClient forecourtStatus={forecourtStatus} />
}

export default AdminMaintenancePage
