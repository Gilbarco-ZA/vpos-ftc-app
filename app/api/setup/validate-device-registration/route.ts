import { NextResponse } from "next/server";

import { definePublicMutationRoute } from '@/src/shared/http/defineRoute'

import { resolveSetupRequestContext } from '@/src/modules/setup/application/context'
import { validateDeviceRegistrationAction } from '@/src/modules/setup/application/validateDeviceRegistrationAction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = definePublicMutationRoute({
  csrf: false,
  handler: async (_req, { body }) => {
    const ctx = await resolveSetupRequestContext({
      rolesWhenConfigured: ['administrator', 'manager'],
    })
    return NextResponse.json(
      await validateDeviceRegistrationAction(
        ctx.stationId,
        String(
          (body as any)?.registrationCode ||
            (body as any)?.RegistrationCode ||
            '',
        ),
      ),
    )
  },
})
