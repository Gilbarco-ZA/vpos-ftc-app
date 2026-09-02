import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { TanzaniaGrossTotalOpeningClient } from '@/components/admin/TanzaniaGrossTotalOpeningClient'
import { TanzaniaProxyRegistrationClient } from '@/components/admin/TanzaniaProxyRegistrationClient'
import { PageHeader } from '@/components/layout/page-header'

export const dynamic = 'force-dynamic'

const AdminTanzaniaFiscalPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tanzania fiscal setup"
        description="Configure TRA and EWURA registrations through vpos-proxy, maintain cumulative fiscal values and receipt counters, select the development, production, or manual receipt verification prefix, and manage the legacy local Device ID override."
      />
      <TanzaniaProxyRegistrationClient />
      <TanzaniaGrossTotalOpeningClient />
    </div>
  )
}

export default AdminTanzaniaFiscalPage
