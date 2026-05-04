import { NextResponse } from "next/server";

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { saveSetupSiteProfile } from '@/src/modules/setup/application/saveSetupSiteProfile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    try {
      const data = await saveSetupSiteProfile(user.stationId, body || {})
      return NextResponse.json({ success: true, data })
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'Failed to save site profile',
        },
        { status: 400 },
      )
    }
  },
})
