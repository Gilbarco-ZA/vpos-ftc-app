import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { validateSetupPayloadAction } from '@/src/modules/setup/application/validateSetupPayloadAction'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { body }) => {
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
