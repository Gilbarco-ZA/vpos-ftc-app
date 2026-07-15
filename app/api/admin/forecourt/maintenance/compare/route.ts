import type { DomsMaintenanceCommandComparisonInput } from '@/src/modules/forecourt/application/compareDomsMaintenanceCommand'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { compareDomsMaintenanceCommandEnvelopes } from '@/src/modules/forecourt/application/compareDomsMaintenanceCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<DomsMaintenanceCommandComparisonInput>({
  roles: ['administrator'],
  handler: async (_req, { body }) =>
    NextResponse.json({
      success: true,
      data: compareDomsMaintenanceCommandEnvelopes(body),
    }),
})
