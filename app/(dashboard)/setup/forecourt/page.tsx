import { requireAuth } from '@/src/shared/auth'

import ForecourtSetupClient from './client'

export const dynamic = 'force-dynamic'

const ForecourtSetupPage = async () => {
  await requireAuth(['administrator', 'manager'])

  return (
    <div className="space-y-4">
      <ForecourtSetupClient />
    </div>
  )
}

export default ForecourtSetupPage
