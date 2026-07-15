import type { ExecuteDomsMaintenanceCommandInput } from '@/src/modules/forecourt/application/executeDomsMaintenanceCommand'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { executeDomsMaintenanceCommand } from '@/src/modules/forecourt/application/executeDomsMaintenanceCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<ExecuteDomsMaintenanceCommandInput>({
  roles: ['field_engineer'],
  handler: async (_req, { user, body }) => {
    const result = await executeDomsMaintenanceCommand(body ?? {}, user)
    return NextResponse.json({ success: true, data: result })
  },
})
