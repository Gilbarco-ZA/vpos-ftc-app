import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listAdminForecourtEvents } from '@/src/modules/forecourt/application/listAdminForecourtEvents'

export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    return NextResponse.json(
      await listAdminForecourtEvents(user.stationId, url.searchParams),
    )
  },
})
