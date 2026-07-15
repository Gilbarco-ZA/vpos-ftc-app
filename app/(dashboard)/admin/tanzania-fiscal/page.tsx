import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { TanzaniaFiscalRegistrationClient } from '@/components/admin/TanzaniaFiscalRegistrationClient'
import { PageHeader } from '@/components/layout/page-header'

export const dynamic = 'force-dynamic'

const AdminTanzaniaFiscalPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tanzania fiscal setup"
        description="Configure TRA and EWURA registration details for Tanzania stations. Values are persisted in the database and used by fiscalization and EWURA reports at runtime."
      />
      <TanzaniaFiscalRegistrationClient />
    </div>
  )
}

export default AdminTanzaniaFiscalPage
