import { requireAuth } from '@/src/shared/auth'

import { TanksRolePage } from '@/components/tanks/TanksRolePage'

export const dynamic = 'force-dynamic'

const TanksPage = async () => {
  const user = await requireAuth(['manager', 'administrator', 'field_engineer'])

  return (
    <TanksRolePage
      role={user.role === 'administrator' ? 'administrator' : 'manager'}
    />
  )
}

export default TanksPage
