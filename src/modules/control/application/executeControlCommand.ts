import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { notFound } from '@/src/platform/web/api/response'
import { controlCommandRegistry } from '@/src/shared/control/registry'

export async function executeControlCommand(
  user: SessionUser,
  params: { module: string; command: string },
  payload: any,
) {
  const mod = String(params.module || '').toLowerCase()
  const cmd = String(params.command || '').toLowerCase()

  const handler = controlCommandRegistry[mod]?.[cmd]
  if (!handler) {
    return notFound(`Unknown command: ${mod}/${cmd}`)
  }

  const data = await handler(
    { stationId: user.stationId, userId: user.id, roles: [user.role] },
    payload,
  )

  return NextResponse.json({ success: !!data?.ok, data })
}
