import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getSupervisorProcessStatus } from '@/src/modules/supervisor/application/getSupervisorProcessStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute<{ name: string }>({
  roles: ['administrator'],
  handler: async (_req, { user, params }) => {
    const res = await getSupervisorProcessStatus(
      user.stationId,
      String(params.name || ''),
    )
    return NextResponse.json(res)
  },
})
