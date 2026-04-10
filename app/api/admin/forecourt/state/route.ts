import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listAdminForecourtState } from '@/src/modules/forecourt/application/listAdminForecourtState'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json(await listAdminForecourtState(user.stationId))
  },
})
