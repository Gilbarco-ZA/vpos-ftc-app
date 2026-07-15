import { NextResponse } from 'next/server'

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getDomsRuntimeDomainSnapshot } from '@/src/modules/forecourt/application/getDomsRuntimeDomainSnapshot'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) => {
    return NextResponse.json(await getDomsRuntimeDomainSnapshot(user.stationId))
  },
})
