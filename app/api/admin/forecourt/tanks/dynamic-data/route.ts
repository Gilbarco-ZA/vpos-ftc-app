import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { sendForecourtCommand } from '@/src/modules/forecourt/application/sendForecourtCommand'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Body = {
  tankId?: string
  densityValue?: string
  expireDateAndTime?: string
  scrollingSpeed?: string
  text?: string
  reason?: string
  source?: string
}

export const POST = defineMutationRoute<Body>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const result = await sendForecourtCommand({
      id: `dynamic-tank-data:${body.tankId ?? Date.now()}`,
      stationId: user.stationId,
      action: 'CHANGE_DYNAMIC_TANK_DATA',
      command: 'CHANGE_DYNAMIC_TANK_DATA',
      payload: {
        ...body,
        stationId: user.stationId,
        requestedBy: user.id,
        requestedRole: user.role,
        source: body.source ?? 'admin-api',
      },
    })

    return NextResponse.json({ success: true, data: result })
  },
})
