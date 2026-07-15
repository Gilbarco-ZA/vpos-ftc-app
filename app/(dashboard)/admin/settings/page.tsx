import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import AdminSettingsClient from './client'

export const dynamic = 'force-dynamic'

const AdminSettingsPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return <AdminSettingsClient />
}

export default AdminSettingsPage
