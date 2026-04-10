import type { UserRole } from '@/src/shared/types'
import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import ReceiptViewerClient from '@/components/receipts/ReceiptViewerClient'

export type ReceiptsRole = 'tenant' | 'manager'

type SearchParams = {
  transactionId?: string
  q?: string
  print?: string
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

  return (
    <ReceiptViewerClient
      initialQuery={(searchParams.q || '').trim()}
      initialTransactionId={(searchParams.transactionId || '').trim()}
      autoPrint={(searchParams.print || '').trim() === '1'}
      title={role === 'manager' ? 'Receipt viewer' : 'Receipts'}
      description={
        role === 'manager'
          ? 'Search for fiscalized receipts and print them instantly.'
          : 'Review and reprint fiscal receipts from the full receipt list.'
      }
      backHref={role === 'manager' ? '/transactions?status=fiscalized' : null}
      backLabel="Back to fiscalized"
      alwaysShowResultsList
    />
  )
}
