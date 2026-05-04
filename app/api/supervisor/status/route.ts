import { NextResponse } from "next/server";

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getSupervisorStatus } from '@/src/modules/supervisor/application/getSupervisorStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    const res = await getSupervisorStatus(user.stationId)
    return NextResponse.json(res)
  },
})
