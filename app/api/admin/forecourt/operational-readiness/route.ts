import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getDomsOperationalReadiness } from '@/src/modules/forecourt/application/getDomsOperationalReadiness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json({
      success: true,
      data: await getDomsOperationalReadiness(user.stationId),
    })
  },
})
