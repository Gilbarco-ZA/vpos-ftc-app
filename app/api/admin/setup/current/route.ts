import type { AdminSetupCurrentPayload } from '@/src/modules/setup/application/getAdminSetupCurrent'
import { NextResponse } from "next/server";

import { defineGetRoute } from '@/src/shared/http/defineRoute'

import { getAdminSetupCurrent } from '@/src/modules/setup/application/getAdminSetupCurrent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type SetupCurrentResponse = AdminSetupCurrentPayload

export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (_req, { user }) =>
    NextResponse.json({
      success: true,
      data: await getAdminSetupCurrent(user.stationId),
    }),
})
