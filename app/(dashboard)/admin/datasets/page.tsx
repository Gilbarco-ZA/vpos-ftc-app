import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { PageHeader } from '@/components/layout/page-header'

import DatasetsClient from './client'

export const dynamic = 'force-dynamic'

const AdminDatasetsPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <DatasetsClient>
      <PageHeader
        title="Country datasets"
        description="Manage fiscal and catalog datasets used during setup and product configuration."
      />
    </DatasetsClient>
  )
}

export default AdminDatasetsPage
