import { NextResponse } from 'next/server'

import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { runTestTransactionPrintout } from '@/src/modules/setup/application/testTransactionPrintout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = definePublicMutationRoute({
  csrf: false,
  handler: async (_req, { body }) => {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    return NextResponse.json(
      await runTestTransactionPrintout(ctx.stationId, body || {}),
    )
  },
})
