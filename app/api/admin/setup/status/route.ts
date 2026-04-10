import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getSetupStatusPayload } from '@/src/modules/setup/application/getSetupStatusPayload'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) =>
    NextResponse.json(await getSetupStatusPayload(user.stationId)),
})
