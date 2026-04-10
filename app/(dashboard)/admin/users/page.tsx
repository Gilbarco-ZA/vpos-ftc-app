import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { UsersPageClient } from '@/components/users/UsersPageClient'

export const dynamic = 'force-dynamic'

const AdminUsersPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return <UsersPageClient />
}

export default AdminUsersPage
