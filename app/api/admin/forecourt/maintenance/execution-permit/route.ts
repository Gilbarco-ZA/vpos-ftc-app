import type { DomsMaintenanceExecutionPermitInput } from '@/src/modules/forecourt/application/domsMaintenanceExecutionPermit'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { issueDomsMaintenanceExecutionPermit } from '@/src/modules/forecourt/application/domsMaintenanceExecutionPermit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<DomsMaintenanceExecutionPermitInput>({
  roles: ['field_engineer'],
  handler: async (_req, { user, body }) => {
    const result = await issueDomsMaintenanceExecutionPermit(body, user)
    return NextResponse.json(
      { success: result.allowed, data: result },
      { status: result.allowed ? 200 : 409 },
    )
  },
})
