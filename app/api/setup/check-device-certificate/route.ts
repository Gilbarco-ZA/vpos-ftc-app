import { NextResponse } from 'next/server'

import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

import { checkDeviceCertificate } from '@/src/modules/setup/application/checkDeviceCertificate'
import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = definePublicMutationRoute({
  csrf: false,
  handler: async () => {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    return NextResponse.json(await checkDeviceCertificate(ctx.stationId))
  },
})
