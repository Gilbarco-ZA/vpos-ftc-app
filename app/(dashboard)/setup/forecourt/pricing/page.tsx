import { requireAuth } from '@/src/shared/auth'

import ForecourtPricingClient from './client'

export const dynamic = 'force-dynamic'

const ForecourtPricingPage = async () => {
  await requireAuth(['administrator', 'manager'])

  return (
    <div className="space-y-4">
      <ForecourtPricingClient />
    </div>
  )
}

export default ForecourtPricingPage
