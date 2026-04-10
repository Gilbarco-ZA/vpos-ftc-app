import { requireAuth } from '@/src/shared/auth'

import { ReceiptsRolePage } from '@/components/receipts/ReceiptsRolePage'

export const dynamic = 'force-dynamic'

const ReceiptsPage = async ({
  searchParams,
}: {
  searchParams: { transactionId?: string; q?: string; print?: string }
}) => {
  const user = await requireAuth(['tenant', 'manager', 'administrator'])

  return (
    <ReceiptsRolePage
      role={user.role === 'tenant' ? 'tenant' : 'manager'}
      searchParams={searchParams}
    />
  )
}

export default ReceiptsPage
