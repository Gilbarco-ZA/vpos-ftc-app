import { NextResponse } from 'next/server'

import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { validateSetupPayloadAction } from '@/src/modules/setup/application/validateSetupPayloadAction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = definePublicMutationRoute({
  csrf: false,
  handler: async (_req, { body }) => {
    await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    const result = await validateSetupPayloadAction(body || {})
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 },
      )
    }
    return NextResponse.json({ success: true })
  },
})
