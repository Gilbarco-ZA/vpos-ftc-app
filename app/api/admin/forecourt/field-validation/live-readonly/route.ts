import type { RunDomsLiveReadOnlyValidationInput } from '@/src/modules/forecourt/application/runDomsLiveReadOnlyValidation'
import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runDomsLiveReadOnlyValidation } from '@/src/modules/forecourt/application/runDomsLiveReadOnlyValidation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = defineMutationRoute<RunDomsLiveReadOnlyValidationInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const data = await runDomsLiveReadOnlyValidation(body, user)
    return NextResponse.json({ success: true, data })
  },
})
