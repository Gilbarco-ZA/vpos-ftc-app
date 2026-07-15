import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminForecourtDiagnostics } from '@/src/modules/forecourt/application/getAdminForecourtDiagnostics'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json(await getAdminForecourtDiagnostics(user.stationId))
  },
})
