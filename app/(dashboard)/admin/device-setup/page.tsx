import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { PageHeader } from '@/components/layout/page-header'

import DeviceSetupWizard from './client'

export const dynamic = 'force-dynamic'

const AdminDeviceSetupPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <div className="space-y-4">
      <PageHeader title="Device Status" />
      <DeviceSetupWizard />
    </div>
  )
}

export default AdminDeviceSetupPage
