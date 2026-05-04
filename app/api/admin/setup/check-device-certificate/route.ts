import { NextResponse } from "next/server";

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { checkDeviceCertificate } from '@/src/modules/setup/application/checkDeviceCertificate'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) =>
    NextResponse.json(await checkDeviceCertificate(user.stationId)),
})
