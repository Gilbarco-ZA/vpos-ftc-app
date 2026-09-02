import { redirect } from 'next/navigation'

import { api } from '@/src/shared/api/fetch'
import { requireAuth } from '@/src/shared/auth'

import { MaintenanceClient } from './MaintenanceClient'

export const dynamic = 'force-dynamic'

const AdminMaintenancePage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  const forecourtStatus = await api('/api/admin/forecourt-sync/status')

  return <MaintenanceClient forecourtStatus={forecourtStatus} />
}

export default AdminMaintenancePage
