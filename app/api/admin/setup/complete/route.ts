import { NextResponse } from "next/server";

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { completeAdminSetup } from '@/src/modules/setup/application/completeAdminSetup'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) => {
    const result = await completeAdminSetup(user.stationId)
    if (!(result as any)?.success) {
      return NextResponse.json(
        { success: false, error: (result as any)?.error || 'Setup failed' },
        { status: Number((result as any)?.status || 400) },
      )
    }
    return NextResponse.json(result)
  },
})
