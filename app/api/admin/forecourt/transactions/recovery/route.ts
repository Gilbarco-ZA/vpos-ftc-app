import type { RunJplTransactionRecoveryInput } from '@/src/modules/forecourt/application/runJplTransactionRecovery'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runJplTransactionRecovery } from '@/src/modules/forecourt/application/runJplTransactionRecovery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<RunJplTransactionRecoveryInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await runJplTransactionRecovery(body, user)
    return NextResponse.json({ success: true, data: result })
  },
})
