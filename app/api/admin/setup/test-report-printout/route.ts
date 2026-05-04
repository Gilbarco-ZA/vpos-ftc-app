import { NextResponse } from "next/server";

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runTestReportPrintout } from '@/src/modules/setup/application/testReportPrintout'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, body }) =>
    NextResponse.json(await runTestReportPrintout(user.stationId, body || {})),
})
