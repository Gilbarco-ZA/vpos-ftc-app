import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getJplProductionWorkflowOverview } from '@/src/modules/forecourt/application/getJplProductionWorkflowOverview'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    return NextResponse.json(
      await getJplProductionWorkflowOverview(user.stationId, url.searchParams),
    )
  },
})
