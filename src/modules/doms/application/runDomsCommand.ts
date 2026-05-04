import type { SessionUser } from '@/src/shared/types'
import { NextResponse } from "next/server";

import { ensureDomsBackendAllowed } from '@/src/shared/doms/backend'

import { normalizeDomsCommand } from './normalizeDomsCommand'

export async function runDomsCommand(
  user: SessionUser,
  params: { command: string },
  payload: any,
) {
  await ensureDomsBackendAllowed(user.stationId)

  const normalized = normalizeDomsCommand(params.command)
  if (!normalized.ok) {
    return normalized.response
  }

  const data = await normalized.cmd(
    { stationId: user.stationId, userId: user.id, roles: [user.role] },
    payload,
  )

  return NextResponse.json({ success: !!data?.ok, data })
}
