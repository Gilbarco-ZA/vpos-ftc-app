import type { UpdateDomsCommissioningChecklistInput } from '@/src/modules/forecourt/application/domsCommissioningChecklist'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { updateDomsCommissioningChecklist } from '@/src/modules/forecourt/application/domsCommissioningChecklist'
import { getDomsCommissioningReadiness } from '@/src/modules/forecourt/application/domsCommissioningReadiness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<UpdateDomsCommissioningChecklistInput>({
  roles: ['administrator', 'manager', 'field_engineer'],
  handler: async (_req, { user, body }) => {
    await updateDomsCommissioningChecklist(body, user)
    return NextResponse.json({
      success: true,
      data: await getDomsCommissioningReadiness(user.stationId),
    })
  },
})
