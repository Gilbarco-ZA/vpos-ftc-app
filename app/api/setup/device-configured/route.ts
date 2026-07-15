import { NextResponse } from 'next/server'

import {
  definePublicGetRoute,
  definePublicMutationRoute,
} from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { getDeviceConfigured } from '@/src/modules/setup/application/getDeviceConfigured'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = definePublicMutationRoute({
  csrf: false,
  handler: async () => {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    return NextResponse.json(await getDeviceConfigured(ctx.stationId))
  },
})

export const GET = definePublicGetRoute({
  handler: async () => {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    return NextResponse.json(await getDeviceConfigured(ctx.stationId))
  },
})
