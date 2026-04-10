import { NextResponse } from 'next/server'

import { defineMutationRoute } from '@/src/shared/http/defineRoute'

import { runSupervisorProcessAction } from '@/src/modules/supervisor/application/runSupervisorProcessAction'

const allowed = new Set(['start', 'stop', 'restart', 'status'])

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineMutationRoute<
  Record<string, unknown>,
  { name: string; action: string }
>({
  roles: ['administrator'],
  csrf: false,
  handler: async (_req, { user, params, body }) => {
    const name = String(params.name || '')
    const action = String(params.action || '').toLowerCase()
    if (!allowed.has(action)) {
      return NextResponse.json(
        { error: 'Invalid action', action },
        { status: 400 },
      )
    }

    const res = await runSupervisorProcessAction(user.stationId, name, action)
    return NextResponse.json(
      body && Object.keys(body).length ? { ...res, request: body } : res,
    )
  },
})
