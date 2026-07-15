import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getDomsCommissioningReadiness } from '@/src/modules/forecourt/application/domsCommissioningReadiness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user }) => {
    return NextResponse.json({
      success: true,
      data: await getDomsCommissioningReadiness(user.stationId),
    })
  },
})
