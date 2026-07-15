import type { ApplyDomsMappingRemediationInput } from '@/src/modules/forecourt/application/applyDomsMappingRemediation'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { applyDomsMappingRemediation } from '@/src/modules/forecourt/application/applyDomsMappingRemediation'
import { getDomsConfigurationReconciliation } from '@/src/modules/forecourt/application/getDomsConfigurationReconciliation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<ApplyDomsMappingRemediationInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const applied = await applyDomsMappingRemediation(body, user)
    const reconciliation = await getDomsConfigurationReconciliation(
      user.stationId,
    )

    return NextResponse.json({
      success: true,
      data: {
        applied,
        reconciliation,
      },
    })
  },
})
