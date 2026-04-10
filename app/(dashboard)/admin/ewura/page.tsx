import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { EwuraAdminClient } from '@/components/admin/EwuraAdminClient'

export const dynamic = 'force-dynamic'

const AdminEwuraPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">EWURA Admin</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        This allows viewing/editing EWURA config and registration, and
        inspecting EWURA transactions/reports.
      </p>

      <EwuraAdminClient />
    </div>
  )
}

export default AdminEwuraPage
