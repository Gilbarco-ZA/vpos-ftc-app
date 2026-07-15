import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { restartSupervisor } from '@/src/modules/supervisor/application/restartSupervisor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user }) => {
    const res = await restartSupervisor(user.stationId)
    return NextResponse.json(res)
  },
})
