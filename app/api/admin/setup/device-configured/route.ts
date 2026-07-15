import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getDeviceConfigured } from '@/src/modules/setup/application/getDeviceConfigured'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) =>
    NextResponse.json(await getDeviceConfigured(user.stationId)),
})
