import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { PageHeader } from '@/components/layout/page-header'

import LanguagesClient from './client'

export const dynamic = 'force-dynamic'

const AdminLanguagesPage = async () => {
  const user = await requireAuth(['administrator'])
  if (user.role !== 'administrator') redirect('/dashboard')

  return (
    <LanguagesClient>
      <PageHeader
        title="Languages"
        description="Manage languages available to the FTC application. These records are the base for the i18n rollout."
      />
    </LanguagesClient>
  )
}

export default AdminLanguagesPage
