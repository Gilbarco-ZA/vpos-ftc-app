import type { RollbackDomsMappingRemediationInput } from '@/src/modules/forecourt/application/rollbackDomsMappingRemediation'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { getDomsConfigurationReconciliation } from '@/src/modules/forecourt/application/getDomsConfigurationReconciliation'
import { listDomsMappingHistory } from '@/src/modules/forecourt/application/listDomsMappingHistory'
import { rollbackDomsMappingRemediation } from '@/src/modules/forecourt/application/rollbackDomsMappingRemediation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<RollbackDomsMappingRemediationInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const rolledBack = await rollbackDomsMappingRemediation(body, user)
    const reconciliation = await getDomsConfigurationReconciliation(
      user.stationId,
    )
    const history = await listDomsMappingHistory(
      user.stationId,
      new URLSearchParams({ limit: '25' }),
    )

    return NextResponse.json({
      success: true,
      data: {
        rolledBack,
        reconciliation,
        history: history.data,
      },
    })
  },
})
