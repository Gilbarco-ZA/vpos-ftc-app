import { redirect } from 'next/navigation'

import { requireAuth } from '@/src/shared/auth'

import { FiscalizedTransactionsRolePage } from '@/components/transactions/FiscalizedTransactionsRolePage'
import { NonFiscalizedTransactionsRolePage } from '@/components/transactions/NonFiscalizedTransactionsRolePage'

export const dynamic = 'force-dynamic'

const TransactionsPage = async ({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) => {
  const user = await requireAuth(['tenant', 'manager', 'administrator'])

  const statusParam = searchParams.status
  const status = Array.isArray(statusParam) ? statusParam[0] : statusParam
  const normalizedStatus = String(status || 'non-fiscalized').toLowerCase()

  if (user.role === 'tenant') {
    return (
      <NonFiscalizedTransactionsRolePage
        role="tenant"
        searchParams={searchParams}
      />
    )
  }

  if (normalizedStatus === 'fiscalized') {
    return (
      <FiscalizedTransactionsRolePage
        role={user.role === 'administrator' ? 'administrator' : 'manager'}
        searchParams={searchParams}
      />
    )
  }

  return (
    <NonFiscalizedTransactionsRolePage
      role={user.role === 'administrator' ? 'administrator' : 'manager'}
      searchParams={searchParams}
    />
  )
}

export default TransactionsPage
