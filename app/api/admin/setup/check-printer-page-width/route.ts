import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { checkPrinterPageWidth } from '@/src/modules/setup/application/checkPrinterPageWidth'

export const POST = defineMutationRoute<Record<string, unknown>>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) =>
    NextResponse.json(await checkPrinterPageWidth(user.stationId, body || {})),
})
