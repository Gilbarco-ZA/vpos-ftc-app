import { requireAuth } from '@/src/shared/auth'

import PumpModeClient from './client'

export const dynamic = 'force-dynamic'

const PumpModePage = async () => {
  await requireAuth(['administrator'])

  return (
    <div className="space-y-4">
      <PumpModeClient />
    </div>
  )
}

export default PumpModePage
