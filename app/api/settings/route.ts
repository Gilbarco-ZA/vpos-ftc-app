import { NextResponse } from 'next/server'

import {
  defineGetRoute,
  defineMutationRoute,
} from '@/src/shared/http/defineRoute'

import { getConsoleSettings } from '@/src/modules/settings/application/getConsoleSettings'
import { saveConsoleSettings } from '@/src/modules/settings/application/saveConsoleSettings'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = defineGetRoute({
  roles: ['administrator', 'manager', 'tenant'],
  handler: async (_req, { user }) => {
    return NextResponse.json(await getConsoleSettings(user.stationId))
  },
})

export const POST = defineMutationRoute({
  roles: ['administrator', 'manager'],
  handler: async (_req, { user, body }) => {
    return NextResponse.json(await saveConsoleSettings(user.stationId, body))
  },
})
