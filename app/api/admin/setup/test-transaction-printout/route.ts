import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runTestTransactionPrintout } from '@/src/modules/setup/application/testTransactionPrintout'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) =>
    NextResponse.json(
      await runTestTransactionPrintout(user.stationId, body || {}),
    ),
})
