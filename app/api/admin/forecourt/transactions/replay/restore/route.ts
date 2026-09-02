import type { RestoreDomsReplayTransactionInput } from '@/src/modules/forecourt/application/restoreDomsReplayTransaction'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { restoreDomsReplayTransaction } from '@/src/modules/forecourt/application/restoreDomsReplayTransaction'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<RestoreDomsReplayTransactionInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    return NextResponse.json({
      success: true,
      data: await restoreDomsReplayTransaction(body, user),
    })
  },
})
