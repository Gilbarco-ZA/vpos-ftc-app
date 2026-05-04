import { requireAuth } from '@/src/shared/auth'

import { CustomersRolePage } from '@/components/customers/CustomersRolePage'

export const dynamic = 'force-dynamic'

const CustomersPage = async (
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }
) => {
  const searchParams = await props.searchParams;
  const user = await requireAuth(['tenant', 'manager', 'administrator'])

  return (
    <CustomersRolePage
      role={user.role === 'administrator' ? 'administrator' : user.role}
      searchParams={searchParams}
    />
  )
}

export default CustomersPage
