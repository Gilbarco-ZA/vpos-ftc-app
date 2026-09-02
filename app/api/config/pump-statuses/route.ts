// Pump configuration status options.
import { ok } from '@/src/platform/web/api/response'
import { requireAuth } from '@/src/shared/auth'

import { ACTIVE_INACTIVE_STATUS_OPTIONS } from '@/src/modules/settings/application/activeInactiveStatusOptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  await requireAuth(['administrator', 'manager'])
  return ok({ options: ACTIVE_INACTIVE_STATUS_OPTIONS })
}
