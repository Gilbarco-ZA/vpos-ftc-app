import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { ManagerReportsClient } from '@/components/reports/ManagerReportsClient'

export const dynamic = 'force-dynamic'

const ReportsPage = async (
  props: {
    searchParams?: Promise<{
      preset?: any
      startDate?: any
      endDate?: any
      pumpNumber?: any
      status?: any
    }>
  }
) => {
  const searchParams = await props.searchParams;
  const user = await requireAuth(['manager', 'administrator'])
  if (!['manager', 'administrator'].includes(user.role)) {
    redirect('/dashboard')
  }

  return (
    <ManagerReportsClient
      initial={{
        preset: (searchParams?.preset as any) || 'last7',
        startDate: (searchParams?.startDate as any) || '',
        endDate: (searchParams?.endDate as any) || '',
        pumpNumber: (searchParams?.pumpNumber as any) || '',
        status: (searchParams?.status as any) || '',
      }}
    />
  )
}

export default ReportsPage
