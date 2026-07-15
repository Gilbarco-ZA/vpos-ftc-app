import type { DomsMaintenanceSessionMutationInput } from '@/src/modules/forecourt/application/domsMaintenanceSessions'
import { NextResponse } from 'next/server'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import {
  listDomsMaintenanceSessions,
  mutateDomsMaintenanceSession,
} from '@/src/modules/forecourt/application/domsMaintenanceSessions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const url = new URL(req.url)
    return NextResponse.json(
      await listDomsMaintenanceSessions(user.stationId, url.searchParams),
    )
  },
})

export const POST = defineMutationRoute<DomsMaintenanceSessionMutationInput>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await mutateDomsMaintenanceSession(body, user)
    return NextResponse.json({ success: true, data: result })
  },
})
