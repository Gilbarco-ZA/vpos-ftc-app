import { NextResponse } from 'next/server'

import { serverError } from '@/src/platform/web/api/response'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { getSetupStatusPayload } from '@/src/modules/setup/application/getSetupStatusPayload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = async () => {
  try {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    return NextResponse.json(await getSetupStatusPayload(ctx.stationId))
  } catch (err) {
    return await serverError(err, {})
  }
}
