import type { DomsMaintenanceFinalConfirmationInput } from '@/src/modules/forecourt/application/confirmDomsMaintenanceCommand.types'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { recordDomsMaintenanceFinalConfirmation } from '@/src/modules/forecourt/application/confirmDomsMaintenanceCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<DomsMaintenanceFinalConfirmationInput>({
  roles: ['field_engineer'],
  handler: async (_req, { user, body }) =>
    NextResponse.json({
      success: true,
      data: await recordDomsMaintenanceFinalConfirmation(body, user),
    }),
})
