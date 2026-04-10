import { redirect } from 'next/navigation'

import { api } from '@/src/shared/api/fetch'
import { requireAuth } from '@/src/shared/auth'

import { AdminSyncClient } from './AdminSyncClient'

export const dynamic = 'force-dynamic'

const AdminSyncPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  const [status, forecourtStatus] = await Promise.all([
    api(`/api/admin/sync/status`),
    api(`/api/admin/forecourt-sync/status`),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sync</h1>
      <AdminSyncClient status={status} forecourtStatus={forecourtStatus} />
    </div>
  )
}

export default AdminSyncPage
