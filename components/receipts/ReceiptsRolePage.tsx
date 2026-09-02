import type { UserRole } from '@/src/shared/types'
import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'
import { resolveDateFilter } from '@/src/shared/crud/dateFilters'
import { getStationCurrentBusinessDate } from '@/src/shared/server/stationBusinessDate'

import ReceiptViewerClient from '@/components/receipts/ReceiptViewerClient'

export type ReceiptsRole = 'tenant' | 'manager'

type SearchParams = {
  transactionId?: string
  q?: string
  print?: string
  startDate?: string
  endDate?: string
  preset?: string
}

export const ReceiptsRolePage = async ({
  role,
  searchParams,
}: {
  role: ReceiptsRole
  searchParams: SearchParams
}) => {
  const allowedRoles: UserRole[] =
    role === 'manager' ? ['manager', 'administrator'] : [role]
  const user = await requireAuth(allowedRoles)
  if (!allowedRoles.includes(user.role)) redirect('/dashboard')
  const businessDate = await getStationCurrentBusinessDate(user.stationId)
  const dateFilter = resolveDateFilter(searchParams, businessDate)

  return (
    <ReceiptViewerClient
      initialQuery={(searchParams.q || '').trim()}
      initialTransactionId={(searchParams.transactionId || '').trim()}
      autoPrint={(searchParams.print || '').trim() === '1'}
      initialFromDate={dateFilter.startDate}
      initialToDate={dateFilter.endDate}
      businessDate={businessDate}
      title={role === 'manager' ? 'Receipt viewer' : 'Receipts'}
      description={
        role === 'manager'
          ? 'Search for fiscalized receipts and print them instantly.'
          : "Review and reprint today's fiscal receipts, or choose another date range."
      }
      backHref={role === 'manager' ? '/transactions?status=fiscalized' : null}
      backLabel="Back to fiscalized"
      alwaysShowResultsList
    />
  )
}
