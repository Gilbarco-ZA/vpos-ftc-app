import { NextResponse } from "next/server";

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { testTraRegistration } from '@/src/modules/setup/application/testTraRegistration'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) => {
    const result = await testTraRegistration(user.stationId)
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      )
    }
    return NextResponse.json(result)
  },
})
