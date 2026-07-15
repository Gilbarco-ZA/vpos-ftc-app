import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { listDomsMappingHistory } from '@/src/modules/forecourt/application/listDomsMappingHistory'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    return NextResponse.json(
      await listDomsMappingHistory(user.stationId, url.searchParams),
    )
  },
})
